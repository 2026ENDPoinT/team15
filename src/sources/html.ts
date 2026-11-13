import { selectAll } from './dom';
import { hasChildren, isTag, isText, type AnyNode } from 'domhandler';
import { normalizeText } from '../../shared/canonicalize';

const blocks = new Set([
  'p',
  'div',
  'li',
  'tr',
  'h1',
  'h2',
  'h3',
  'h4',
  'section',
  'blockquote',
]);
const ignored = new Set(['script', 'style', 'noscript', 'template']);

// 브라우저 DOM·Node stream 없이 문단, 표의 열, 명시적인 줄바꿈을 보존한다.
export function htmlToText(node: AnyNode): string {
  function visit(current: AnyNode): string {
    if (isText(current)) return current.data.replace(/[\t\r\n ]+/g, ' ');
    if (isTag(current) && ignored.has(current.name)) return '';
    if (isTag(current) && current.name === 'br') return '\n';
    if (isTag(current) && current.name === 'tr') {
      const cells = current.children.filter(
        (child) => isTag(child) && ['td', 'th'].includes(child.name),
      );
      return `\n${cells.map(visit).join(' | ')}\n`;
    }
    const inner = hasChildren(current)
      ? current.children.map(visit).join('')
      : '';
    if (isTag(current) && blocks.has(current.name)) return `\n${inner}\n`;
    return inner;
  }
  return normalizeText(visit(node));
}

export function httpUrl(value: string, base: string): string | null {
  if (!value.trim()) return null;
  try {
    const url = new URL(value, base);
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function unique<T>(values: T[]): T[] {
  return [
    ...new Map(values.map((value) => [JSON.stringify(value), value])).values(),
  ];
}

export function bodyLinks(body: AnyNode, text: string, base: string) {
  const links: Array<{ label: string; url: string }> = [];
  for (const link of selectAll('a[href]', body)) {
    const url = httpUrl(link.attribs.href ?? '', base);
    if (url) links.push({ label: htmlToText(link), url });
  }
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'{}]+/giu)) {
    let value = match[0].replace(/[.,;!?:、。]+$/u, '');
    // 문장 괄호만 제거하며 URL 내부의 균형 잡힌 괄호는 유지한다.
    for (const [open, close] of [
      ['(', ')'],
      ['[', ']'],
    ] as const) {
      while (
        value.endsWith(close) &&
        value.split(close).length > value.split(open).length
      ) {
        value = value.slice(0, -1);
      }
    }
    const url = httpUrl(value, base);
    if (url && !links.some((link) => link.url === url))
      links.push({ label: value, url });
  }
  return unique(links);
}
