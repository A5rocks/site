+++
title = "Type checking as a form of pattern matching"
date = 2021-07-21
updated = 2021-07-21
+++

Word of warning: I'm mainly talking about Python's type checking landscape.
Things I talk about might or might not apply to your programming language of
choice.

With that out of the way... What exactly do I mean by pattern matching? I mean
pattern matching as found in Elixir and other cool languages. Basically:

```elixir
# this is just a map
variable = %{
    "a" => "b",
    "c" => "d",
}

# pattern matching!
%{
    "a" => n
} = variable

# at this point, `n` has `"b"`:
IO.inspect(n)
```

Now then, type-checking being similar to pattern-matching may seem obvious --
after all, `int = int` and `list[int] = list[int]`! But it goes a little bit
deeper than that when you consider generics.

Take for example, this function:

```py
def f(x):
    return x.y
```

In this case, I want to "pattern match" the `y` property out of the `x` value!
Looking at the Elixir code above may yield a clue on how this can be done, but
first -- how would this be done in TypeScript?

In TypeScript, this would be done using operators. In this case, the operator
to use is the indexing operator:

```typescript
function f<T extends {y: any}>(x: T): T["y"] {
    return x.y
}
```

But in Python, there's no indexing operator: pattern matching to the rescue!

```py
from typing import Protocol, TypeVar

T = TypeVar("T")

class ExtractY(Protocol[T]):
    y: T

def f(x: ExtractY[T]) -> T:
    return x.y
```

To me, this has an odd sense of symmetry. Just a cool observation!

(Also I'll try to post more short-but-interesting things...)
