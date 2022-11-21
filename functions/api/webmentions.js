const checkJSON = (content, target) => Object.values(content).some((v) => {
  if (typeof v === "object") return checkJSON(v, target);
  else return v === target;
})

const consume = async (stream) => {
  const r = await stream.getReader();
  while (!(await r.read()).done) {}
}

class Handler {
  constructor(callback) {
    this.allowed = false;
    this.callback = callback;
  }

  element() {
    this.allowed = true;
  }

  async end() {
    if (this.allowed) {
      await this.callback();
    }
  }
}

const checkContent = {
  "text/plain": async (response, target, cb) => {
    if ((await response.text()).includes(target)) await cb();
  },
  "application/json": async (response, target, cb) => {
    if (checkJSON(await response.json(), target)) await cb();
  },
  "text/html": async (response, target, cb) => {
    const handler = new Handler(cb);

    const rewriter = new HTMLRewriter()
      .on(`a[href="${target}"]`, handler)
      .on(`img[href="${target}"]`, handler)
      .on(`video[href="${target}"]`, handler)
      .onDocument(handler);

    await consume(rewriter.transform(response).body);
  }
};

export async function onRequest({ env, request }) {
  if (request.method === "GET") {
    const target = (new URL(request.url)).searchParams.get('target');
    if (!target) {
      return new Response("Missing: \`target\`.", { status: 400 });
    }

    const objects = await env.webmentions.list({ prefix: target })

    return new Response(JSON.stringify({
      urls: objects.keys.map((key) => key.name.split(" ")[1]),
      count: objects.keys.length,
      truncated: !objects.list_complete,
    }));
  }

  // should have form encoded data.
  const body = await request.formData();

  // required parameters
  const missing = ["target", "source"].filter((name) => !body.has(name));
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
    ].filter((x) => ["https:", "http:"].includes((new URL(body.get(x))).scheme));

    if (schemes.length) {
      return new Response(`Incorrect URL scheme for: \`${schemes.join("\`, \`")}\`.`, { status: 400 });
    }
  } catch (e) {
    // TODO: more accurate error
    return new Response("Either `target` or `source` is not a URL.", {status: 400});
  }


  // The receiver SHOULD check that `target`` is a valid resource for which it can accept Webmentions.
  const target = new URL(body.get("target"));
  const source = new URL(body.get("source"));

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
  const contentType = res.headers.get("Content-Type").split(";")[0];
  if (!["text/plain", "application/json", "text/html"].includes(contentType)) {
    return new Response(`Unknown Content-Type ${res.headers.get("Content-Type")}`, { status: 400 });
  }

  await checkContent[contentType](
    res,
    target.href,
    // todo: parse the body (of request or source) to find what to keep / mark this as? (like/comment)
    async () => await env.webmentions.put(`${target.href} ${source.href}`, "h")
  )

  return new Response(request.method, { status: 202 });
}
