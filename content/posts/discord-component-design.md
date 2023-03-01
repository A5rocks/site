+++
title = "Designing an interface for Discord components: A dash through prior work"
date = 2023-02-28
updated = 2023-02-28

[taxonomies]
projects = [ "library", "bot" ]
+++

Discord components are a strange mix of stateless and stateful programming. In this blog post, I will cover many different library's implementations.

Full disclosure before I start (before I even research) that I quite dislike current interfaces for components. I will try to enumerate reasons when I come across them but I have a very specific interface that I believe works best and I will present it in the next few posts.

Here is a table of contents, in case this post gets too lengthy:

#### Table of Contents

 - [`hikari-yuyo`](#hikari-yuyo)
 - [`hikari-flare`](#hikari-flare)
 - [`discord.py`](#discord-py)


#### [`hikari-yuyo`](https://github.com/FasterSpeeding/Yuyo/)

This library was created by a friend, so I've been influenced quite a bit by their descriptions of things. With that out of the way, let me look at [some descriptive usage I quickly found](https://github.com/DiscordOttBot/ottbot_v4/blob/45ae2bb2f73b1116e8b773b2db805d3884974e58/ottbot/core/modules/auto_role.py#L81-L91). Note that I've isolated it and that it's very out of date -- modern code using Tanjun and Yuyo looks much nicer!

```py
async def register_auto_role_callbacks(
    event: hikari.StartedEvent,
    component_client: yuyo.ComponentClient = tanjun.inject(type=yuyo.ComponentClient),
    bot: OttBot = tanjun.inject(type=OttBot),
    db: AsyncPGDatabase = tanjun.inject(type=AsyncPGDatabase),
) -> None:

    ids = await db.rows("SELECT (guild_id, role_id) FROM auto_roles")
    if ids:
        for gid, rid in ids:
            component_client.set_constant_id(f"autorole_{gid}_{rid}", give_autorole)

```

I think `set_constant_id` is an interesting concept. In my opinion, a high level library should handle persistant components just fine and in this case the function gets abused (just check the prefix of components and check the rest refers to a certain guild id / role id) but I can certainly see use cases where this is useful.

Here's [another example I just found](https://github.com/nxtlo/Fated/blob/9466ad58c8207f2bfa8ee20f95c74c5468ba0c49/core/std/boxed.py#L102-L128) that is not just `set_constant_id` abuse:

```py
async def generate_component(
    ctx: tanjun.abc.SlashContext | tanjun.abc.MessageContext,
    iterable: (
        collections.Generator[tuple[hikari.UndefinedType, hikari.Embed], None, None]
        | collections.Iterator[tuple[hikari.UndefinedType, hikari.Embed]]
    ),
    component_client: yuyo.ComponentClient,
    timeout: datetime.timedelta | None = None,
) -> None:
    pages = yuyo.ComponentPaginator(
        iterable,
        authors=(ctx.author,),
        triggers=(
            yuyo.pagination.LEFT_DOUBLE_TRIANGLE,
            yuyo.pagination.LEFT_TRIANGLE,
            yuyo.pagination.STOP_SQUARE,
            yuyo.pagination.RIGHT_TRIANGLE,
            yuyo.pagination.RIGHT_DOUBLE_TRIANGLE,
        ),
        timeout=timeout or datetime.timedelta(seconds=90),
    )
    if next_ := await pages.get_next_entry():
        content, embed = next_
        msg = await ctx.respond(
            content=content, embed=embed, component=pages, ensure_result=True
        )
        component_client.set_executor(msg, pages)
```

I love the idea of reusable components. Any higher-level system should be able to take dynamic arguments (and encode them in the output somehow): if it cannot that's in my opinion a failure of design. I'm not too sure about this `set_executor` idea -- I believe this is just because Yuyo only supports temporary components. In this case it makes sense to run something to mark an executor as processing a specific message's component.

I found this after writing the section, but [here's some of the author's usage of Yuyo's components](https://github.com/FasterSpeeding/Reinhard/blob/1e03ab92e5362a215f8cd337babde75c4d36c8bd/reinhard/client.py#L69-L71). This is included as it is idiomatic usage, along with the [handler for completeness](https://github.com/FasterSpeeding/Reinhard/blob/37096ff666efacdaf033ceccc502cd4d66a67852/reinhard/utility/basic.py#L164-L190):

```py
# in another file:
    component_client = yuyo.ComponentClient(event_manager=bot.event_manager, event_managed=False).set_constant_id(
        utility.DELETE_CUSTOM_ID, utility.delete_button_callback, prefix_match=True
    )

# handler:
async def delete_button_callback(ctx: yuyo.ComponentContext, /) -> None:
    """Constant callback used by delete buttons.

    Parameters
    ----------
    ctx
        The context that triggered this delete.
    """
    # Filter is needed as "".split(",") will give [""] which is not a valid snowflake.
    author_ids = set(
        map(hikari.Snowflake, filter(None, ctx.interaction.custom_id.removeprefix(DELETE_CUSTOM_ID).split(",")))
    )
    if (
        not author_ids  # no IDs == public
        or ctx.interaction.user.id in author_ids
        or ctx.interaction.member
        and author_ids.intersection(ctx.interaction.member.role_ids)
    ):
        await ctx.defer(defer_type=hikari.ResponseType.DEFERRED_MESSAGE_UPDATE)
        await ctx.delete_initial_response()

    else:
        await ctx.create_initial_response(
            "You do not own this message",
            response_type=hikari.ResponseType.MESSAGE_CREATE,
            flags=hikari.MessageFlag.EPHEMERAL,
        )
```

Here's my takeaways from Yuyo:
 - Components should be permanent by default
   - Otherwise, it's much too tempting to just use temporary components. After all, they're more powerful!
   - Stuff like `component_client.set_executor` can be replaced with permanent components.
 - Don't let people manually listen to a single custom ID: that's a footgun.
   - It turns out Yuyo supports `prefix_match=True` in `set_constant_id` -- that should be the default!
 - Reusable components are a good idea.

Now I will look at some other alternatives to `hikari-yuyo` that remain in the `hikari` space I know more.

#### [`hikari-flare`](https://github.com/brazier-dev/hikari-flare)

I chose this one as the other one I can find (`hikari-miru`) is inspired by Discord.py's view system, which I will cover soon. I prefer looking at a variety here!

Flare proports to offer "stateless" components. Now, I want my components to have state as much as the next person, but this might offer some insights into persistant components. I don't know yet!

They offer a [pretty descriptive example in the README](https://github.com/brazier-dev/hikari-flare/blob/5076683986497e0e0fb6e1cb4280149d4d2e62d0/README.md#example):

```py
import flare
import hikari


@flare.button(label="Test Button", style=hikari.ButtonStyle.PRIMARY)
async def test_button(
    ctx: flare.MessageContext,
) -> None:
    await ctx.respond(content="Hello World!")

@flare.button(label="State Button", style=hikari.ButtonStyle.PRIMARY)
async def state_button(
    ctx: flare.MessageContext,
    # Args and kwargs are used for state.
    number: int,
) -> None:
    await ctx.respond(content=f"The number is: {number}")

bot = hikari.GatewayBot("...")
flare.install(bot)

@bot.listen()
async def buttons(event: hikari.GuildMessageCreateEvent) -> None:

    # Ignore other bots or webhooks pinging us
    if not event.is_human:
        return

    me = bot.get_me()

    # If the bot is mentioned
    if me.id in event.message.user_mentions_ids:
        # Set custom state for components that need it
        row = await flare.Row(test_button(), state_button(5))
        message = await event.message.respond("Hello Flare!", component=row)

bot.run()
```

I... uhh... What?

 - Why does `flare.Row` need to be `await`-ed?
 - `flare.install` is such a derpy mechanism. I don't know an alternative, but it feels quite derpy.
 - How does Flare assign custom IDs? Can I just rename the function and it's fine? Can I change the label?
 - How does Flare keep state? Isn't it stateless?

OK so let me address my own questions one by one.

 1. Why is `flare.Row` async?

Alright the answer here is a bit underwhelming: it's because converters (will cover next) have an async method to convert to a string used in the `custom_id`.

 2. How does Flare assign custom IDs?

Here's code I found on my last little venture through the code base:

```py
    async def set_custom_id(self):
        self._custom_id = await bootstrap.active_serde.serialize(
            self._cookie, self._dataclass_annotations, self._dataclass_values
        )
```

Here that is broken into parts (least to most surprising):
 - `self._dataclass_annotations` is, well, the type annotations (ie if something is an `int`)
 - `self._dataclass_values` is the actual values provided
 - `self._cookie` is unironically basically what I expected. It's based on the name. LOL! Luckily you can just set this to a string.

This seems awfully rigid. I can't by default move my component to another file without breaking backwards compatibility, which kind of ruins the whole point of persistant components. Let alone providing a mechanism to migrate between different schemas (that's my own term!).

 3. How does Flare keep state?

As already covered, it serializes that state using some strange converters implementation. No room for migrations, etc. It's calling itself stateless because it doesn't use a database or something.

Overall, I actually quite like the ideas embodied by Flare actually. Don't be fooled by my criticism, I believe it is a nice piece of work. The main reason I criticized it more than Yuyo as Flare is more what I am looking for so I have more background to look at the flaws!

However, despite all that, I do believe Flare as designed is too much a footgun to imitate without serious consideration as to the usability. To put it as I feel, I more prefer the industrial-safety feeling of Yuyo over Flare's sugary high. Yummy sugar, though.

Now it's time to check out the elephant in the room, for Python at least.

#### [`discord.py`](https://github.com/Rapptz/discord.py)

Discord.py's system is designed as far as I can tell for temporary component handlers. That's not what I am looking for -- let's see how it handles persistant "views." Here's [an example they provide](https://github.com/Rapptz/discord.py/blob/7a0744c9a90a38570db631d21f2d28d626710b3e/examples/views/persistent.py). I haven't added or removed anything.

```py
# This example requires the 'message_content' privileged intent to function.

from discord.ext import commands
import discord


# Define a simple View that persists between bot restarts
# In order for a view to persist between restarts it needs to meet the following conditions:
# 1) The timeout of the View has to be set to None
# 2) Every item in the View has to have a custom_id set
# It is recommended that the custom_id be sufficiently unique to
# prevent conflicts with other buttons the bot sends.
# For this example the custom_id is prefixed with the name of the bot.
# Note that custom_ids can only be up to 100 characters long.
class PersistentView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label='Green', style=discord.ButtonStyle.green, custom_id='persistent_view:green')
    async def green(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_message('This is green.', ephemeral=True)

    @discord.ui.button(label='Red', style=discord.ButtonStyle.red, custom_id='persistent_view:red')
    async def red(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_message('This is red.', ephemeral=True)

    @discord.ui.button(label='Grey', style=discord.ButtonStyle.grey, custom_id='persistent_view:grey')
    async def grey(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_message('This is grey.', ephemeral=True)


class PersistentViewBot(commands.Bot):
    def __init__(self):
        intents = discord.Intents.default()
        intents.message_content = True

        super().__init__(command_prefix=commands.when_mentioned_or('$'), intents=intents)

    async def setup_hook(self) -> None:
        # Register the persistent view for listening here.
        # Note that this does not send the view to any message.
        # In order to do this you need to first send a message with the View, which is shown below.
        # If you have the message_id you can also pass it as a keyword argument, but for this example
        # we don't have one.
        self.add_view(PersistentView())

    async def on_ready(self):
        print(f'Logged in as {self.user} (ID: {self.user.id})')
        print('------')


bot = PersistentViewBot()


@bot.command()
@commands.is_owner()
async def prepare(ctx: commands.Context):
    """Starts a persistent view."""
    # In order for a persistent view to be listened to, it needs to be sent to an actual message.
    # Call this method once just to store it somewhere.
    # In a more complicated program you might fetch the message_id from a database for use later.
    # However this is outside of the scope of this simple example.
    await ctx.send("What's your favourite colour?", view=PersistentView())


bot.run('token')
```

Would it be too much to say I dislike this? Here's a couple criticisms:
 - discord.py provides no help with providing state in `custom_id`
   - Flare provides some strange Serializer thing
   - Yuyo provides (optional) prefix-based matching
 - Even if I haven't called libraries out on this yet: I really quite despise callbacks. If necessary, I will take them. Generally however I would prefer to avoid them out of personal preference.
 - I don't see an obvious customization point. I believe `discord.ui.Button` is how you can e.g. set the label dynamically but I cannot tell if you can both set the label dynamically and yet still handle button pushes.
 - discord.py makes temporary components (with a timeout) the default, whereas I believe most people want persistent components. I do agree that being able to make temporary components is a good idea, however.

I have seen examples of discord.py's views in other examples and I think it's a pretty tidy solution to the point that other libraries (e.g. `hikari-miru`) emulate it. It's too focused on temporary components to be much use to me, however.

---

To be continued when I encounter some more unique implementations. I can't really find any that aren't the above or extremely low-level. Feel free to DM me on Discord if you find something you want me to look at!
