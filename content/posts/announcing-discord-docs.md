+++
title = "Making a Discord library: part 1"
date = 2023-07-10
updated = 2023-07-10

[taxonomies]
projects = [ "library" ]
+++

I've been focusing on <https://github.com/fleuralice/discord-docs> recently. It's time to put that to the test.

I believe that a set of JSON schemas can help easily create a basic Discord library, especially for those who have a good idea of what they want to make. Today, I'm going to work on my own library (`bloom`) and use the following components for it:
 - `attrs` for data models cause I absolutely love `attrs`!
 - `anyio` for concurrency as while I would prefer `trio`, people prefer `asyncio` :(
 - `discord-docs` for the schemas I will use, for convenience's sake.
 - my own websocket mini-library, which uses `wsproto` and `httpx` under the hood
 - `cattrs` for converting things from the gateway into my data models
 - `isort`, `black`, `ssort`, `pyupgrade` for making generated files nice to look at (and make them valid in the process)

My goal is to connect to Discord's gateway and log any seen messages. HTTP routes aren't in `discord-docs` yet and ratelimiting is complex: I want to make a post all about ratelimiting!

I already have a basic module structure with [`_websocket.py`](https://gist.github.com/A5rocks/ae6c0b459cb85a69707475dbf8e8f50a) and a couple irrelevant modules. Let's start!

### Step 1: connect to Discord

---

In my console I get this:

```
{"t":null,"s":null,"op":10,"d":{"heartbeat_interval":41250,"_trace":["[\"[trimmed]\",{\"micros\":0.0}]"]}}
```

Essentially, I just connected my websocket to `wss://gateway.discord.gg/?v=10&encoding=json` and printed any messages I got out from it. Here's the pertinent code:

```py
async def connect(client: AsyncClient):
    async with ws_connect("https://gateway.discord.gg/?v=10&encoding=json", client) as ws:
        async for message in ws.read_messages():
            print(message)
```

### Step 2: heartbeating

Essentially, I am just going through this flowchart:

<!--I need to use an <img> tag and not markup so that this isn't in a <p> tag-->
<img src="https://raw.githubusercontent.com/discord/discord-api-docs/e54e2c895e2973d79078dfe617b271c51082c7e3/images/gateway-lifecycle.svg" alt="Discord's documented gateway lifecycle"/>

This means the next step is to start heartbeating (with some jitter) the moment I get the opcode 10 event. Can do! (NOTE: the Discord's docs note "In the first heartbeat, `jitter` is an offset value between 0 and `heartbeat_interval`" which is just wrong. Don't trust the documentation!!)

---

While I'm waiting for my heartbeat code to actually send something, I believe it works. As such, let me write up this part now!

The relevant bits were:
 - creating a `anyio.TaskGroup` to spawn off the heartbeating task
 - spawning off the heartbeating task via `tg.start_soon(heartbeat_loop, ws, msg["d"]["heartbeat_interval"] / 1000)`
 - handling if the opcode I receive is `1`
 - the actual heartbeating loop, as below:

```py
async def heartbeat_loop(ws: WebsocketConnection, interval: float) -> None:
    await anyio.sleep(interval * random.random())
    while True:
        await ws.write(json.dumps({"op": 1, "d": None}))
        await anyio.sleep(interval)
```

By the time I've finished writing this, I can see the following in the console:

```py
{'t': None, 's': None, 'op': 10, 'd': {'heartbeat_interval': 41250, '_trace': ['["[trimmed]",{"micros":0.0}]']}}
{'t': None, 's': None, 'op': 11, 'd': None}
{'t': None, 's': None, 'op': 11, 'd': None}
{'t': None, 's': None, 'op': 11, 'd': None}
{'t': None, 's': None, 'op': 11, 'd': None}
```

### Step 3: identifying

---

This part's mechanical enough: just write to the websocket right after you spawn off the heartbeating task and add a few more parameters to your function.

Here's what I did:
```py
await ws.write(json.dumps({
    "op": 2,
    "d": {
        "token": token,
        "properties": {
            "os": platform.system(),
            "browser": "doll",
            "device": "bloom"
        },
        "intents": intents
    }
}))
```

I like the quirk of differing `"browsers"` and `"device"` where the `"browser"` is the codename for the specific gateway implementation and the `"device"` is the actual name for the library. This isn't actually what the documentation suggests doing, but I like it enough I do it. Totally up to you!

At this point, I took break because I knew how annoying the next part would be!

... I ran my gateway during this break and it didn't break. Shocking. Still, onwards.

### Step 4: sharing state

I want to push state into a shared class, meaning that I can get some heartbeating task <-> gateway receive communication going on.

---

So, I just defined this `Shard` class:

```py
@attrs.define()
class Shard:
    ws: WebsocketConnection
    _seq: Optional[int]
    _heartbeat_acknowledged: bool
```

Next, I handled opcode `0` events by setting `_seq` to their `"s"` key and then handled opcode `11` events by setting `_heartbeat_acknowledged` to `True`.

### Step 5: resuming

This is a pretty annoying step as resumes only really get sent to you every 2 hours or so, last I remember. However, a very simple trick is just to comment out the part of your code that tells the heartbeat an event was acknowledged.

---

After quite some extra indentation levels, I think this works. I have a `while True` loop around a `try` statement that catches when the websocket raises due to it being closed. It's a bit hacky, but it works. It doesn't actually end up successfully resuming but I'm pretty sure that's just an artifact of the whole close-the-connection strategy?

Actually, I don't think that's right.

---

Aha!! Turns out, you need to append `resume_gateway_url` with your normal gateway URL parameters. That's annoying. But now my code works. I had to change too much and I don't think there's any specific thing to show... Though I guess here's my `try` statement:

```py
try:
    url = shard._resume_url.replace("wss://", "https://") if resume else "https://gateway.discord.gg"
    url += "?v=10&encoding=json"
    shard._heartbeat_acknowledged = True
    if last_identify - anyio.current_time() >= 30 * 60:
        identifies = 0
    if not resume:
        identifies += 1
        last_identify = anyio.current_time()
    if identifies > 5:
        print("too many identifies too quickly!")
        break

    ...

except DeadWSConnection as e:
    resume = shard._resume_url and shard._session_id and e.code in {3000, 4000, 4001, 4002, 4008}
except DeadConnection as e:
    resume = True
finally:
    shard._ws = None
    if not resume:
        await anyio.sleep(5)
```

Now then, that works. Let's get immediately to the next step.

### Step 6: log messages

Ensure that your intents are `GUILD_MESSAGES` and `MESSAGE_CONTENT`: the magic number to look for is `33280`. Then, just add something in the main gateway loop. I'll go ahead and do that for myself now...

---

Here's what I did:

```py
elif msg["t"] == "MESSAGE_CREATE" and not msg["d"]["author"].get("bot"):
    print(f'{msg["d"]["author"]["global_name"]}: {msg["d"]["content"]}')
```

Now, let me go ahead and talk to some people!

```
A5rocks: forgot `"bot"` was an optional thing lol
A5rocks: but it works now 🙏
ibx: "bot"
A5rocks: ur a bot
```

This all works and could be the end of it. Now, let's *finally* get into where `discord-docs` comes into play. I hope it's obvious by this point that setting up a basic gateway connection, while not necessarily easy (especially around restructuring required for resuming), is possible without trying too hard.

---

### Step 7: autogenerate the models

... Aaaand, time:

```
$ mypy .\bloom\autogenerated.py
Success: no issues found in 1 source file
```

Now I have a 30,000 line autogenerated file. Great. That took me maybe 4-5 hours (I lost track of time) so I saved probably 10 hours or so, but more importantly that was really REALLY fun. The code is awful, I can still very much clean up the output models... but it works. As far as I know, it works. Step 8 will validate this.

Also, a bit of that time was spent fixing `discord-docs` itself :^). The most important things to keep in mind, IMO, are the interactions `allOf` has. While this is an *extremely* powerful attribute, `discord-docs` uses it in 2 main ways:
 - inheritance (i.e. `allOf: [{$ref: ...}]`)
 - spreading a base class all over a gigantic enum

Additionally, I had a whole bunch of errors about definition order but rather than fix them, I used `from __future__ import annotations` (forward annotations) and `ssort`. These were massive helps and prevented me from overengineering my own ordering.

### Step 8: deserialize into the models

Luckily I'm using `cattrs`. It shouldn't be too hard to codegen deserialization code (or make your own slower dynamic library for such) but this is minimal effort!

---

Yeah, that wasn't too hard. I had to fix a bit more and add a couple things to the autogenerated file but overall pretty easy thing to add. And now, I'm kinda done here. There's a *lot* more any good library needs, but I've got something that connects to Discord and gets things as they happen. That's really really cool!!

I'll be back when `discord-docs` describes the REST routes!
