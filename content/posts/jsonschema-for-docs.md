+++
title = "I don't think JSONSchema is a good choice for documentation"
date = 2023-07-05
updated = 2023-07-05

[taxonomies]
projects = [ "library" ]
+++

Over the last week or so I've been working on making making Discord libraries easier [through a collection of JSONSchemas I plan to keep up to date](https://github.com/fleuralice/discord-docs).

I am going to write a post about whether it works and what else needs to be done, but just as a preliminary result: I really don't think JSONSchema is a good choice for documentation. This may seem heretical given it's used by e.g. OpenAPI but it is *significantly* more geared towards validation. While intermixing those concerns is fine and all, this leaves a schema specification that is weird for documentation.

A specific example would be JSONSchema's `"not"` keyword: you can specify what something is *not*. This makes complete sense with validation in mind but when it comes to documentation: how exactly do you merge negative attributes with positive attributes? If I say something is not an integer, does that mean it should be documented as accepting everything else? There's quite a few questions here about how this fits in and I can think of no satisfying solution.

If you know a specification format more geared towards documentation, please let me know! Maybe I'll even finally set up my WebMentions so you can reply in your own posts! (doubtful)
