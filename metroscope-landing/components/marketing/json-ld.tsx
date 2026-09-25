/**
 * Structured data, server-rendered into the cached HTML.
 *
 * A crawler that runs no JavaScript still gets it, which is the only reason to
 * emit JSON-LD at all rather than reading the page.
 *
 * The escape is not decoration. `JSON.stringify` happily produces `</script>`
 * inside a string, an article titled "Cara pakai tag `</script>`" is enough,
 * and the browser's HTML parser closes the block there, spilling the rest of
 * the JSON into the document as markup. Escaping `<` costs nothing and is
 * invisible to a JSON parser.
 *
 * Five consumers: articles, programmes, the homepage, `/faq` and
 * `/testimonials`. Two of them had this same six-line component copied inline
 * before §2.8, each with its own copy of the escape, which is the version of
 * this that eventually ships without it.
 */
export function JsonLd({ docs }: { docs: (object | null | undefined)[] }) {
  return (
    <>
      {docs
        .filter((doc): doc is object => Boolean(doc))
        .map((doc, i) => (
          <script
            key={i}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(doc).replace(/</g, '\\u003c') }}
          />
        ))}
    </>
  );
}
