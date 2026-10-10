# Unl, your why agent.

Your AI already knows how to reason. Unl gives it your reason.

<!-- cadence:start -->
**1,924 changes merged** into Unl's main branch since 23 May 2026, on 94 of the 141 days since.

![1,924 changes merged into Unl's main branch, one square per day](https://raw.githubusercontent.com/Unlimitless-Inc/.github/main/profile/cadence.svg)

<sub>Each change that landed on the main branch of Unl's private engine repository counts once, by UTC day: a merged pull request is one change, however many commits it held. Only these counts and dates leave it; the code stays private. Read 10 October 2026. What each change did, in plain words: <a href="https://unlimitless.ai/changelog">the changelog</a>.</sub>
<!-- cadence:end -->

## What is open, and what is hosted

| | |
|---|---|
| [**unl**](https://github.com/Unlimitless-Inc/unl) | **Open, MIT.** Everything that runs on your side: the `unl` command, the AI SDK package, the Cursor plugin, an example for each agent framework, and the decision format with a conformance check you can run on your own code. |
| [**status**](https://github.com/Unlimitless-Inc/status) | **Open.** The checks that test Unl from outside its own infrastructure. |
| **Unl itself** | **Hosted** at `api.unlimitless.ai`. The service that keeps your decisions with their reasons and chooses which ones bear on a task. Its code is private. |

## Start

Tell the agent you already use:

```text
Read unlimitless.ai/start.md, set up Unl, and show me the decisions you find.
```

Or run the client's tests with no account and no model call:

```bash
git clone https://github.com/Unlimitless-Inc/unl.git
cd unl/packages/ai-sdk && npm install && npm test
```

## Follow the build

Star [Unlimitless-Inc/unl](https://github.com/Unlimitless-Inc/unl) to follow along. More at [unlimitless.ai](https://unlimitless.ai).
