+++
title = "Next.js Dynamic Routing with Cloudflare Pages"
date = 2021-08-03
updated = 2021-08-03
+++

Maybe you want to meme around with the new JAMStack "innovation" or whatever.
Anyways, for some reason, you decided to use Next.js in Cloudflare Pages.

Now then, Next.js has dynamic routing... This means that `/whatever/[id].js`
will get requests from both `/whatever/blah` and `/whatever/foo`. Obviously,
this is not great for something like Cloudflare Pages, which statically serves
your pages.

However, upon reading the documentation, you find out that Pages supports
Single Page Applications! All you have to do is uh, not have a `404.html` page
in the output, and any 404-ing requests will be redirected to your index page!

Okay, so this seems simple............. WHAT DO YOU MEAN NEXT.JS DOESN'T
SUPPORT A SINGLE PAGE APPLICATION OUTPUT???!? I'm switching to Nuxt.

...

...

...

Still with me? Let's figure this out of pure stubbornness, and because my
self-hypnosis to like Next.js worked. So, what's the game plan?

Well, Cloudflare Pages supports Cloudflare Workers, and I know that actually
the dynamic url can be accessed at `/whatever/[id]` even in Pages. So, maybe I
can redirect `/whatever/:id` to `/whatever/[id]`, and it will just work?

Okay then, let's do this!

Once you've made a Page and set it up a custom domain (I'll be using
`pages-test.helvetica.moe` as mine), install wrangler as in [the Cloudflare
documentation](https://developers.cloudflare.com/workers/cli-wrangler/install-update).

Now, you can get started with your worker with `wrangler generate <folder name
to create>`, or `wrangler init` in an already made folder. Here's what I've
personally configured the worker as: (`wrangler.toml`)

```toml
name = "next-dynamic-worker"
type = "webpack"

workers_dev = false
route = "pages-test.helvetica.moe/some/dynamic/route/*"
zone_id = "your zone id"
```

Make sure to `wrangler auth`, and then the actual worker code can be written.
The main library to note is `itty-router`, which you can install with `npm i
itty-router`.

Essentially, at this point, the boilerplate `index.js` should be:

```js
import { Router } from 'itty-router'

const router = Router();

router.all('/some/dynamic/route/:param', async (request) => {
  // this part is coming soon:tm:
  return new Response('responding from the worker!');
})

addEventListener('fetch', event => {
  event.respondWith(router.handle(event.request));
});
```

Now, make sure to deploy your worker with `wrangler publish`, and then
redeploy the pages application (for some reason new workers changes only pop
up after a deploy???). Then, visiting
`https://your-page.whatever/some/dynamic/route/blah` should respond with
`responding from the worker!`. If it doesn't, well, you're on your own here :-)

Now, the rest is easy. All that needs to be done is editing the url that is
used, and returning the response from that. Here's what I did:

```js
const url = new URL(request.url);

// (replace "param" with whatever your parameter is called)
url.pathname = '/some/dynamic/route/[param]'; 

const newRequest = new Request(url, request);
return await fetch(newRequest);
```

Cool! Now, just `wrangler publish` again, *re*deploy the pages application (
:( ), and it should just work!
