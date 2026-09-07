---
name: dakka-arabic-voice
description: Egyptian-dialect voice and football vernacular for all player-facing Arabic in Dakka — assistant-coach debriefs, commentary, press conferences, news, UI copy. Load before writing or editing any Arabic string, prompt, or LLM output template.
---

# Dakka Arabic voice

Everything a player reads is **Egyptian colloquial** — the way a coach on the touchline actually
talks. Not Modern Standard Arabic. Not translated English.

## The register

The assistant coach is a competent, blunt Egyptian assistant. He respects you, he does not flatter
you, and he tells you when you got it wrong.

| Write this | Not this | Why |
|---|---|---|
| «خسرت الماتش في الدقيقة 63» | «تمت خسارة المباراة في الدقيقة الثالثة والستين» | MSA reads like a news bulletin |
| «الـCDM بتاعك كان مفيّس» | «لاعب الوسط المدافع كان مرهقاً» | that is how it is said |
| «الخط الدفاعي العالي أكلك» | «تسبب الخط الدفاعي المرتفع في استقبال الأهداف» | shorter, and it lands |
| «جرّب تبدّل بدري المرة الجاية» | «يُنصح بإجراء التبديل في وقت مبكر» | advice, not a memo |

## Football vernacular — use it

مفيّس · اتخض · قافل · واكل الأرض · بيلعب في الفاضي · مقفول عليه · الجناح بيدخل من بره ·
كسّر الخط · شغل بيني · طلعة الظهير · تكتل · مرتد · قفلة · حريف · دكة · صافرة · جولة

Club and player nicknames are part of the world, not decoration.

## Hard rules

1. **Never state a fact that is not in the trace.** No invented minutes, scorers, or statistics.
   A thin trace produces a short debrief — the model does not fill the gap with fluent nonsense.
2. **Numbers in Latin digits** (`63`, `2-1`, `78%`), text in Arabic. Never spell numbers out in words.
3. **No hedging padding.** Not «قد يكون من الممكن أن». Say it.
4. **No flattery after a loss.** The player lost; say what caused it. The product's whole promise is
   an honest answer to «ليه خسرت؟».
5. **Latin technical terms stay Latin** — `xG`, `CDM`, `4-3-3`, `PvP`. That is how Egyptian football
   people write them.
6. **Second person singular masculine by default** for the manager (the player names themselves at
   onboarding). Never invent gendered assumptions about anyone else.

## Length

Debrief: 3–5 short paragraphs. Commentary line: one sentence. Press answer: 2–3 sentences.
Long output is a failure mode, not thoroughness.

## Never

Repeat a template verbatim within one match. The competitor ships the identical commentary line at
minute 3 and minute 7 of the same game; that is the bar we are clearing.
