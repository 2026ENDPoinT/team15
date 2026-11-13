import { unzipSync } from 'fflate';
import { SaxesParser } from 'saxes';
import { readLimitedText, sha256 } from './http';
import { parseDocument } from 'htmlparser2';
import { selectAll, selectOne } from '../../src/sources/dom';
import { hashNoticeContent } from '../../shared/canonicalize';
import {
  analyzeNoticeRequestSchema,
  MAX_REQUEST_BYTES,
  type AnalyzeNoticeRequest,
} from '../../shared/contracts';

const maxBytes = 5 * 1024 * 1024;
const maxXmlBytes = 2 * 1024 * 1024;

export function extractHwpxText(bytes: Uint8Array): string {
  if (bytes.length > maxBytes) throw new Error('Attachment exceeds 5 MiB.');
  let xmlBytes = 0;
  const sections = unzipSync(bytes, {
    filter(entry) {
      if (!/^Contents\/section\d+\.xml$/.test(entry.name)) return false;
      xmlBytes += entry.originalSize;
      if (xmlBytes > maxXmlBytes) throw new Error('HWPX XML is too large.');
      return true;
    },
  });
  const names = Object.keys(sections).sort((a, b) =>
    a.localeCompare(b, 'en', { numeric: true }),
  );
  if (!names.length) throw new Error('HWPX sections are missing.');
  const lines: string[] = [];
  let length = 0;
  for (const name of names) {
    const parser = new SaxesParser({ xmlns: true });
    const xml = sections[name]!;
    if (xml.byteLength > maxXmlBytes) throw new Error('HWPX XML is too large.');
    let inText = false;
    let text = '';
    parser.on('doctype', () => {
      throw new Error('HWPX XML cannot contain a DTD.');
    });
    parser.on('opentag', (tag) => {
      if (tag.local === 't') {
        inText = true;
        text = '';
      }
    });
    parser.on('text', (value) => {
      if (inText) text += value;
    });
    parser.on('closetag', (tag) => {
      if (tag.local !== 't') return;
      inText = false;
      const line = text.trim();
      if (line) {
        length += line.length + (lines.length ? 1 : 0);
        if (length > 12_000)
          throw new Error('추출 텍스트가 12,000자를 넘었습니다.');
        lines.push(line);
      }
    });
    parser.write(new TextDecoder('utf-8', { fatal: true }).decode(xml)).close();
  }
  return lines.join('\n');
}

async function readAttachment(response: Response): Promise<Uint8Array> {
  if (!response.ok || !response.body)
    throw new Error('Attachment download failed: ' + response.status);
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body.cancel();
    throw new Error('Attachment exceeds 5 MiB.');
  }
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new Error('Attachment exceeds 5 MiB.');
      parts.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  if (![80, 75, 3, 4].every((value, index) => bytes[index] === value)) {
    throw new Error('Attachment response is not an HWPX ZIP.');
  }
  return bytes;
}

export async function enrichSeoultechHwpx(
  html: string,
  input: AnalyzeNoticeRequest,
  {
    fetchAttachment = fetch,
    extract = extractHwpxText,
    signal,
  }: {
    fetchAttachment?: typeof fetch;
    signal?: AbortSignal;
    extract?: (bytes: Uint8Array) => string | Promise<string>;
  } = {},
) {
  const source = new URL(input.source_url);
  if (
    source.origin !== 'https://www.seoultech.ac.kr' ||
    source.pathname.replace(/\/$/, '') !== '/service/info/notice' ||
    source.searchParams.get('bnum') !== '4691'
  ) {
    throw new Error('Only the SeoulTech general notice board is supported.');
  }

  const area = selectOne(
    '.wrap_view table.tbl_view .list_attach',
    parseDocument(html),
  );
  const hrefs = area ? selectAll('a[href]', area) : [];
  const downloads = hrefs.flatMap(({ attribs }) => {
    const match = attribs.href?.match(
      /^javascript:downloadfile\(\s*'(\/storage\/www\/bbs\/4691)'\s*,\s*'([a-zA-Z0-9_-]+\.hwpx)'\s*,\s*'([^'\r\n]+\.hwpx)'\s*\);?$/i,
    );
    return match?.[1] && match[2] && match[3]
      ? [{ path: match[1], storedName: match[2], name: match[3] }]
      : [];
  });
  const warnings: string[] = [];
  const attachmentTexts: NonNullable<AnalyzeNoticeRequest['attachment_texts']> =
    [];
  if (input.attachment_texts)
    throw new Error('Expected an unenriched analysis request.');
  for (const [index, attachment] of input.attachments.entries()) {
    if (!/\.hwpx$/i.test(attachment.name) || attachmentTexts.length >= 2)
      continue;
    const matches = downloads.filter(({ name }) => name === attachment.name);
    if (matches.length !== 1) {
      warnings.push(attachment.name + ': 다운로드 정보를 확인하지 못했습니다.');
      continue;
    }
    const { path, storedName, name } = matches[0]!;
    try {
      const response = await fetchAttachment(
        new URL('/hcm/bbs/bbs_download.jsp', source),
        {
          method: 'POST',
          body: new URLSearchParams({
            fpath: path,
            fname: storedName,
            ogrfname: name,
          }),
          headers: { Referer: source.href },
          redirect: 'error',
          signal: signal ?? AbortSignal.timeout(12_000),
        },
      );
      const bytes = await readAttachment(response);
      const text = (await extract(bytes)).trim();
      if (!text || text.length > 12_000)
        throw new Error('추출 텍스트가 비어 있거나 12,000자를 넘었습니다.');
      const candidate = {
        attachment_index: index,
        sha256: Array.from(
          new Uint8Array(
            await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)),
          ),
          (n) => n.toString(16).padStart(2, '0'),
        ).join(''),
        text,
      };
      if (
        new TextEncoder().encode(
          JSON.stringify({
            ...input,
            attachment_texts: [...attachmentTexts, candidate],
          }),
        ).byteLength > MAX_REQUEST_BYTES
      ) {
        throw new Error('분석 요청 크기 제한을 넘었습니다.');
      }
      attachmentTexts.push(candidate);
    } catch (error) {
      warnings.push(
        name +
          ': ' +
          (error instanceof Error ? error.message : '첨부를 읽지 못했습니다.'),
      );
    }
  }

  if (!attachmentTexts.length) return { request: input, warnings };
  const enriched = { ...input, attachment_texts: attachmentTexts };
  return {
    request: analyzeNoticeRequestSchema.parse({
      ...enriched,
      content_hash: await hashNoticeContent(enriched, sha256),
    }),
    warnings,
  };
}

export async function enrichPilotHwpx(
  input: AnalyzeNoticeRequest,
  pilotNoticeId: string | undefined,
  fetchAttachment: typeof fetch,
): Promise<AnalyzeNoticeRequest> {
  if (
    !pilotNoticeId ||
    pilotNoticeId !== input.notice_id ||
    input.attachment_texts ||
    !input.attachments.some(({ name }) => /\.hwpx$/i.test(name))
  )
    return input;

  const postId = /^seoultech_general:4691:(\d+)$/.exec(input.notice_id)?.[1];
  if (!postId) return input;
  // Only use the server-constructed public detail URL and no client credentials.
  const source = new URL('https://www.seoultech.ac.kr/service/info/notice');
  source.search = new URLSearchParams({
    do: 'commonview',
    bnum: '4691',
    bidx: postId,
  }).toString();
  const signal = AbortSignal.timeout(6_000);
  try {
    const response = await fetchAttachment(source, {
      redirect: 'error',
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      return input;
    }
    const html = await readLimitedText(
      response.body,
      256 * 1024,
      'INPUT_TOO_LARGE',
      signal,
    );
    const result = await enrichSeoultechHwpx(
      html,
      { ...input, source_url: source.href },
      { fetchAttachment, signal },
    );
    return result.request.attachment_texts
      ? { ...result.request, source_url: input.source_url }
      : input;
  } catch {
    return input;
  }
}
