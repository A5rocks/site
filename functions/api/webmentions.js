const checkJSON = (content, target) => Object.values(content).some((v) => {
  if (typeof v === "object") return checkJSON(v, target);
  else return v === target;
})

const checkContent = {
  "text/plain": async (response, target) => (await response.text()).includes(target),
  "application/json": async (response, target) => checkJSON(await response.json(), target),
  "text/html": async (response, target) => {
    let allowed = false;
    const f = () => { allowed = true; };

    await new HTMLRewriter()
      .on(`a[href="${target}"]`, f)
      .on(`img[href="${target}"]`, f)
      .on(`video[href="${target}"]`, f)
      .transform(response)
      .text();

    return allowed;
  }
};

export async function onRequest({ env, request }) {
  // should have JSON.
  const body = await request.json();

  // required parameters
  const missing = ["target", "source"].filter((name) => !(name in body));
  if (missing.length > 0) {
    return new Response(`Missing: \`${missing.join("\`, \`")}\`.`, { status: 400 });
  }

  // The receiver MUST check that `source` and `target` 
  //     valid URLs
  try {
    //   and are of schemes that are supported by the receiver.
    const schemes = [
      "target",
      "source"
    ].filter((x) => ["https:", "http:"].includes((new URL(body[x])).scheme));

    if (schemes.length) {
      return new Response(`Incorrect URL scheme for: \`${schemes.join("\`, \`")}\`.`, { status: 400 });
    }
  } catch (e) {
    // TODO: more accurate error
    return new Response("Either `target` or `source` is not a URL.", {status: 400});
  }


  // The receiver SHOULD check that `target`` is a valid resource for which it can accept Webmentions.
  const target = new URL(body.target);
  const source = new URL(body.source);

  if (target.hostname !== "helvetica.moe" || !target.pathname.startsWith("/posts")) {
    return new Response("`target` should start with `https://helvetica.moe/posts/...`.");
  }

  // If the receiver is going to use the Webmention in some way
  //  ... then it MUST perform an HTTP GET request on source following any HTTP redirects
  //      (and SHOULD limit the number of redirects it follows)
  const headers = new Headers();
  // The receiver SHOULD include an HTTP Accept header indicating its
  // preference of content types that are acceptable.
  headers.set("Accept", "text/plain, application/json, text/html");
  // TODO: "SHOULD limit the number of redirects it follows"
  const res = await fetch(source.href, { headers: headers, redirect: "follow" });

  // The receiver SHOULD use per-media-type rules to determine
  // whether the source document mentions the target URL.
  if (!(await checkContent[res.headers.get("Content-Type")](res, target.href))) {
    return new Response("`source` is not mentioned in `target`.");
  }

  await env.webmentions.put(`${target.href} ${source.href}`, JSON.stringify(body));

  return new Response(request.method, { status: 202 });
}
