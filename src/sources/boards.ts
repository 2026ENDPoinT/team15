import { selectAll, selectOne } from './dom';
import { isTag, type AnyNode } from 'domhandler';
import { removeElement } from 'domutils';
import { parseDocument } from 'htmlparser2';
import {
  dateSchema,
  noticeRefSchema,
  type BoardAdapter,
  type SourceId,
} from '../../shared/contracts';
import { bodyLinks, htmlToText, httpUrl, unique } from './html';

export class SourceError extends Error {
  constructor(
    public readonly code:
      | 'STRUCTURE_CHANGED'
      | 'INVALID_URL'
      | 'HTTP_ERROR'
      | 'TIMEOUT'
      | 'NETWORK_ERROR',
    message: string,
  ) {
    super(message);
    this.name = 'SourceError';
  }
}

export const boardConfigs = {
  seoultech_general: {
    label: '대학공지사항',
    listUrl: 'https://www.seoultech.ac.kr/service/info/notice',
    boardId: '4691',
    view: 'commonview',
    size: 15,
    listTable: '.wrap_list .tbl_list',
    dateCell: 'td.dn5',
    detailTable: '.wrap_view table.tbl_view',
    attachment: '.list_attach',
  },
  seoultech_cs: {
    label: '컴퓨터공학과 학부 공지사항',
    listUrl: 'https://computer.seoultech.ac.kr/info/notice',
    boardId: '58476',
    view: 'view',
    size: 6,
    listTable: '.board_container table.board',
    dateCell: 'td.body_col_regdate',
    detailTable: '.board_container .wrap_cont table.tbl_list',
    attachment: 'td.file',
  },
} as const;

export function validateBoardUrl(
  sourceId: SourceId,
  value: string,
  postId?: string,
): URL {
  const config = boardConfigs[sourceId];
  const url = new URL(value);
  const base = new URL(config.listUrl);
  if (
    url.origin !== base.origin ||
    url.pathname.replace(/\/$/, '') !== base.pathname ||
    url.username ||
    url.password ||
    (url.searchParams.has('bnum') &&
      url.searchParams.get('bnum') !== config.boardId) ||
    (postId !== undefined &&
      (url.searchParams.get('bnum') !== config.boardId ||
        url.searchParams.get('bidx') !== postId ||
        url.searchParams.get('do') !== config.view))
  ) {
    throw new SourceError(
      'INVALID_URL',
      '예상한 게시판·게시물 주소가 아닙니다.',
    );
  }
  return url;
}

function dateFrom(text: string): string | null {
  const candidate = text
    .match(/\b\d{4}[-.]\d{2}[-.]\d{2}\b/)?.[0]
    ?.replace(/\./g, '-');
  return dateSchema.safeParse(candidate).success ? candidate! : null;
}

function field(table: AnyNode, name: string): string {
  const heading = selectAll('th', table).find(
    (node) => htmlToText(node) === name,
  );
  let next = heading?.nextSibling;
  while (next && !isTag(next)) next = next.nextSibling;
  return next && isTag(next) && next.name === 'td' ? htmlToText(next) : '';
}

export function createBoardAdapter(sourceId: SourceId): BoardAdapter {
  const config = boardConfigs[sourceId];
  return {
    sourceId,
    listUrl: config.listUrl,
    buildListUrl(page, previousPage) {
      if (!Number.isInteger(page) || page < 1 || page > 5)
        throw new RangeError('목록 페이지는 1~5입니다.');
      const url = new URL(config.listUrl);
      if (previousPage) {
        validateBoardUrl(sourceId, previousPage.responseUrl);
        const doc = parseDocument(previousPage.html);
        const form = selectOne('form[name="frmSearch"]', doc);
        if (!form)
          throw new SourceError(
            'STRUCTURE_CHANGED',
            '페이지 이동 폼을 찾지 못했습니다.',
          );
        for (const input of selectAll('input[type="hidden"][name]', form)) {
          url.searchParams.set(input.attribs.name!, input.attribs.value ?? '');
        }
      }
      url.searchParams.set('bnum', config.boardId);
      url.searchParams.set('page', String(page));
      url.searchParams.set('size', String(config.size));
      return url.href;
    },
    parseList(html, responseUrl) {
      validateBoardUrl(sourceId, responseUrl);
      const table = selectOne(config.listTable, parseDocument(html));
      if (!table)
        throw new SourceError(
          'STRUCTURE_CHANGED',
          '공지 목록 표를 찾지 못했습니다.',
        );
      const refs = new Map<string, ReturnType<typeof noticeRefSchema.parse>>();
      const rows = selectAll('tr.body_tr', table);
      for (const row of rows) {
        let found = false;
        for (const anchor of selectAll('a[href]', row)) {
          const href = httpUrl(anchor.attribs.href ?? '', responseUrl);
          if (!href) continue;
          const url = new URL(href);
          const postId = url.searchParams.get('bidx');
          if (
            url.searchParams.get('do') !== config.view ||
            !postId ||
            !/^\d+$/.test(postId)
          )
            continue;
          validateBoardUrl(sourceId, href, postId);
          const id = `${sourceId}:${config.boardId}:${postId}`;
          const ref = noticeRefSchema.parse({
            id,
            sourceId,
            boardId: config.boardId,
            postId,
            sourceUrl: href,
            title: htmlToText(anchor),
            publishedDate:
              selectAll(config.dateCell, row)
                .map((cell) => dateFrom(htmlToText(cell)))
                .find(Boolean) ?? null,
          });
          refs.set(id, ref);
          found = true;
          break;
        }
        if (!found)
          throw new SourceError(
            'STRUCTURE_CHANGED',
            '공지 행에서 상세 링크를 찾지 못했습니다.',
          );
      }
      if (
        !rows.length &&
        !/등록된.*없|게시물.*없|게시글.*없/.test(htmlToText(table))
      ) {
        throw new SourceError(
          'STRUCTURE_CHANGED',
          '공지 행 구조를 확인할 수 없습니다.',
        );
      }
      return [...refs.values()];
    },
    parseDetail(html, ref) {
      noticeRefSchema.parse(ref);
      if (ref.sourceId !== sourceId || ref.boardId !== config.boardId)
        throw new SourceError('INVALID_URL', '출처가 일치하지 않습니다.');
      validateBoardUrl(sourceId, ref.sourceUrl, ref.postId);
      const table = selectOne(config.detailTable, parseDocument(html));
      const body = table && selectOne('td.cont', table);
      if (!table || !body)
        throw new SourceError(
          'STRUCTURE_CHANGED',
          '상세 표 또는 본문을 찾지 못했습니다.',
        );
      for (const node of selectAll('script, style, noscript, template', table))
        removeElement(node);
      const title = field(table, '제목');
      if (!title)
        throw new SourceError(
          'STRUCTURE_CHANGED',
          '상세 제목을 찾지 못했습니다.',
        );
      const attachmentArea = selectOne(config.attachment, table);
      const attachments = attachmentArea
        ? unique(
            selectAll('a', attachmentArea)
              .map((link) => ({
                name: htmlToText(link),
                url: httpUrl(link.attribs.href ?? '', ref.sourceUrl),
              }))
              .filter((attachment) => attachment.name.length > 0),
          )
        : [];
      const bodyText = htmlToText(body);
      const hasBodyImages = selectAll('img', body).length > 0;
      if (!bodyText && !hasBodyImages && attachments.length === 0)
        throw new SourceError(
          'STRUCTURE_CHANGED',
          '비어 있는 본문을 정상 공지로 수집하지 않습니다.',
        );
      return {
        ...ref,
        title,
        publishedDate: dateFrom(field(table, '날짜')),
        bodyText,
        extractedLinks: bodyLinks(body, bodyText, ref.sourceUrl),
        attachments,
        hasBodyImages,
        sourceUpdatedAt: null,
      };
    },
  };
}
