import Link from 'next/link';
import type { ProseNode } from '@/lib/articles-api';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  TipTap AST → React (doc 13 §10.4).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The article body is stored as a ProseMirror document, and this walks it into
 * elements. There is **no `dangerouslySetInnerHTML` anywhere in this file**,
 * and that is the entire reason the body is an AST rather than HTML: an editor
 * who pastes from a website cannot inject a script, because a script is not a
 * node type this renderer knows and unknown nodes render as nothing.
 *
 * That last property is the one to preserve. `NODES` is a closed map; adding an
 * editor extension without adding it here degrades to missing content, never to
 * markup escaping into the page. The failure is visible and harmless, which is
 * the correct direction for a renderer fed by whoever holds `/site`.
 */

/** Marks, applied innermost-first so `bold(italic(text))` nests correctly. */
function withMarks(text: string, marks: ProseNode['marks'], key: string) {
  let node: React.ReactNode = text;
  for (const mark of marks ?? []) {
    switch (mark.type) {
      case 'bold':
      case 'strong':
        node = <strong key={key}>{node}</strong>;
        break;
      case 'italic':
      case 'em':
        node = <em key={key}>{node}</em>;
        break;
      case 'code':
        node = (
          <code key={key} className="rounded bg-neutral-100 px-1.5 py-0.5 text-[0.9em]">
            {node}
          </code>
        );
        break;
      case 'strike':
        node = <s key={key}>{node}</s>;
        break;
      case 'link': {
        const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : '';
        /**
         * Only http(s) and site-relative links are rendered as links.
         *
         * `javascript:` in an href is script execution on click, and it reaches
         * here from the editor's own link dialog. Anything else renders as
         * plain text, the words survive, the navigation does not.
         */
        const safe = /^https?:\/\//i.test(href) || href.startsWith('/');
        if (!safe) break;
        const external = href.startsWith('http');
        node = external ? (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-navy underline underline-offset-2"
          >
            {node}
          </a>
        ) : (
          <Link key={key} href={href} className="text-navy underline underline-offset-2">
            {node}
          </Link>
        );
        break;
      }
      default:
        break; // Unknown mark: keep the text, drop the decoration.
    }
  }
  return node;
}

function renderNodes(nodes: ProseNode[] | undefined, keyPrefix: string): React.ReactNode[] {
  return (nodes ?? []).map((node, i) => renderNode(node, `${keyPrefix}-${i}`));
}

function renderNode(node: ProseNode, key: string): React.ReactNode {
  if (node.type === 'text') return withMarks(node.text ?? '', node.marks, key);

  const children = renderNodes(node.content, key);

  switch (node.type) {
    case 'doc':
      return <div key={key}>{children}</div>;

    case 'paragraph':
      // An empty paragraph is spacing the editor put there on purpose.
      return (
        <p key={key} className="mt-5 leading-[1.8] text-neutral-700">
          {children.length ? children : ' '}
        </p>
      );

    /**
     * h2/h3 only, matching the editor's `levels: [2, 3]`.
     *
     * The page's own `<h1>` is the article title. A body that could emit its own
     * h1 would give the page two, which is the single most common way a
     * well-written article confuses a search engine about what it is about.
     */
    case 'heading': {
      const level = node.attrs?.level === 3 ? 3 : 2;
      const id = headingId(node);
      return level === 2 ? (
        <h2
          key={key}
          id={id}
          className="mt-12 scroll-mt-28 text-2xl font-bold tracking-tight text-neutral-900"
        >
          {children}
        </h2>
      ) : (
        <h3 key={key} id={id} className="mt-8 scroll-mt-28 text-xl font-semibold text-neutral-900">
          {children}
        </h3>
      );
    }

    case 'bulletList':
      return (
        <ul key={key} className="mt-5 list-disc space-y-2 pl-6 text-neutral-700">
          {children}
        </ul>
      );
    case 'orderedList':
      return (
        <ol key={key} className="mt-5 list-decimal space-y-2 pl-6 text-neutral-700">
          {children}
        </ol>
      );
    case 'listItem':
      return (
        <li key={key} className="leading-[1.8]">
          {children}
        </li>
      );

    case 'blockquote':
      return (
        <blockquote
          key={key}
          className="border-gold mt-8 border-l-4 pl-5 text-lg text-neutral-600 italic"
        >
          {children}
        </blockquote>
      );

    case 'codeBlock':
      return (
        <pre key={key} className="mt-6 overflow-x-auto rounded-xl bg-neutral-900 p-4 text-sm">
          <code className="text-neutral-100">{children}</code>
        </pre>
      );

    case 'horizontalRule':
      return <hr key={key} className="mt-10 border-neutral-200" />;

    case 'hardBreak':
      return <br key={key} />;

    case 'image': {
      const src = typeof node.attrs?.src === 'string' ? node.attrs.src : '';
      if (!/^https?:\/\//i.test(src) && !src.startsWith('/')) return null;
      const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : '';
      return (
        <figure key={key} className="mt-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} loading="lazy" className="w-full rounded-2xl" />
          {alt && (
            <figcaption className="mt-2 text-center text-sm text-neutral-500">{alt}</figcaption>
          )}
        </figure>
      );
    }

    default:
      /**
       * Unknown block: render its children, drop the wrapper.
       *
       * A node type this renderer has not met is far more likely to be a
       * container the editor gained than something meaningful in itself, so
       * keeping the words is the better failure. Nothing about the node reaches
       * the DOM, so an unknown type cannot carry markup in with it.
       */
      return children.length ? <div key={key}>{children}</div> : null;
  }
}

/** Flatten a node's text, for headings and the table of contents. */
export function textOf(node: ProseNode): string {
  if (typeof node.text === 'string') return node.text;
  return (node.content ?? []).map(textOf).join('');
}

/**
 * A heading's anchor, derived from its own words.
 *
 * Derived rather than stored so it survives an edit: a heading rewritten in the
 * editor gets a new id and the TOC, built from the same function on the same
 * pass, still points at it. The trade is that renaming a heading breaks a
 * deep link somebody shared, which is the lesser loss against a TOC whose links
 * silently go nowhere.
 */
export function headingId(node: ProseNode): string {
  const slug = textOf(node)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'bagian';
}

/** Every h2, in order, the table of contents (doc 13 §10.6). */
export function tableOfContents(doc: ProseNode): { id: string; text: string }[] {
  return (doc.content ?? [])
    .filter((n) => n.type === 'heading' && n.attrs?.level === 2)
    .map((n) => ({ id: headingId(n), text: textOf(n) }));
}

export function ArticleBody({ doc }: { doc: ProseNode }) {
  return <div className="text-[1.05rem]">{renderNodes(doc.content, 'b')}</div>;
}
