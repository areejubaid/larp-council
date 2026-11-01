"""Offline conversation engine. Idea specific templates per persona, stance and context.

Placeholders: {topic} short phrase of the idea, {kw} its main word, {kw2} a second word,
{ap} / {Ap} a phrase from the user's latest answer ("the walk in part"), lowercase and capitalized.
No network, no dependencies. Variants are picked with a seeded random so the same session is repeatable.
"""
import random
import re

# Persona -> kind -> context -> variants. Kinds: open, agree, disagree, challenge, advice, follow,
# peer_agree, peer_disagree. peer_* are replies to another persona and are shared across contexts.
T = {
    "jobs": {
        "open": {
            "startup": [
                "Okay, {topic}. Before anything else, who is this really for, and what do they feel the first time they use it?",
                "I'm looking at {topic} and I can't tell what the one thing is. What's the one thing it does that nothing else does?",
                "Forget the technology for a second. What does someone actually do in the first thirty seconds with {topic}?",
            ],
            "life": [
                "Forget the pros and cons list. About {topic}, if your time were short, would you still want to do it?",
                "{Topic}. What are you actually drawn to here, and what are you just afraid of losing?",
                "I want the honest version. Is {topic} what you want, or what other people expect of you?",
            ],
        },
        "agree": {
            "startup": [
                "{Ap} is what I like. It's focused, and focus is rare.",
                "Okay, {ap} feels right. That's a decision, not a feature list.",
            ],
            "life": [
                "{Ap} is a real reason. It sounds like something you actually care about.",
                "Okay, {ap} matters. Follow that, not what looks good on paper.",
            ],
        },
        "disagree": {
            "startup": [
                "I don't buy {ap}. It sounds like a feature, not a reason to exist.",
                "Hm. {Ap} doesn't convince me. It feels bolted on.",
            ],
            "life": [
                "I don't think {ap} is enough. That sounds like safe talking, not what you want.",
                "Hm, {ap} sounds like fear to me, not desire.",
            ],
        },
        "challenge": {
            "startup": [
                "That's still fuzzy. {Ap} is a lot of words, so what would you cut?",
                "I hear you, but {ap} isn't simple enough yet. Simple is hard, and you're not there.",
            ],
            "life": [
                "That's the answer you'd give your parents. What's the real one, about {ap}?",
                "I'm not hearing what you want. {Ap} sounds like the reasonable answer, not the true one.",
            ],
        },
        "advice": {
            "startup": [
                "Here's what I'd do. Build everything around {ap} and say no to the rest of {topic}.",
                "Make {ap} feel obvious, then worry about everything else.",
            ],
            "life": [
                "Don't let other people's expectations pick for you. Weigh {ap} against what you'd regret.",
                "Trust that the dots connect later. Pick the path you'd be excited to work on every day.",
            ],
        },
        "follow": {
            "startup": [
                "What's the thing you'd say no to, even though people will ask for it?",
                "Who's the first person who'd be upset if {kw} disappeared tomorrow?",
                "Walk me through how it feels to use. Where does it get in the way?",
            ],
            "life": [
                "If nobody was watching or judging, which way would you go?",
                "What would you regret more, trying {kw} or never knowing?",
                "What's the one thing you'd have to say no to in order to do this properly?",
            ],
        },
        "peer_agree": [
            "I'm with them on this. It only works if it's simple.",
            "Yeah, that's right. And {kw} has to be simple enough to explain in a sentence.",
        ],
        "peer_disagree": [
            "I don't agree. You're optimizing the wrong thing, the experience comes first.",
            "No, I see it differently. That's the kind of thinking that makes a product complicated.",
        ],
        "close": {
            "high": "Alright, that's time. There's something real in {topic}, so stay focused and don't dilute it.",
            "low": "Alright, that's time. {topic} isn't sharp enough yet, so keep cutting until the point is obvious.",
        },
    },
    "musk": {
        "open": {
            "startup": [
                "Okay, so {topic}. What's the fundamental reason this can't already be done way cheaper than it is today?",
                "Similar things exist around {kw}. What's actually different about yours, like ten times better, not ten percent?",
                "What's the hardest part of {topic}? Not the fun part, the part that can kill it.",
            ],
            "life": [
                "So on {topic}, what's the actual goal? If this works perfectly, what does your life look like in five years?",
                "{Topic}. What's the downside if it goes wrong, and can you recover from it? That's the real question.",
                "Is {topic} something that really matters to you, or is it just comfortable? Those are very different.",
            ],
        },
        "agree": {
            "startup": [
                "Yeah, {ap} makes sense. That's a real advantage.",
                "Okay, {ap} is actually a good point. I like that.",
            ],
            "life": [
                "Yeah, {ap} is a solid reason. That's something you can build on.",
                "Okay, {ap} is a fair point. It shows you've thought about it.",
            ],
        },
        "disagree": {
            "startup": [
                "I don't think {ap} holds up. The numbers have to work or it's just a nice story.",
                "Hm, {ap} feels like an assumption, not a fact. Test it.",
            ],
            "life": [
                "I don't buy {ap}. That sounds like a comfortable reason, not an important one.",
                "{Ap} doesn't really change the downside, does it?",
            ],
        },
        "challenge": {
            "startup": [
                "That's vague. {Ap} sounds good, but what's the actual number? Cost, time, anything.",
                "Okay, but {ap} is hand waving. What's the physics of it?",
            ],
            "life": [
                "That's vague. What's the real goal behind {ap}?",
                "{Ap} isn't a plan. What do you actually do on Monday?",
            ],
        },
        "advice": {
            "startup": [
                "I'd delete half of this. Start with {ap}, ship it fast, and let reality tell you what's broken.",
                "Simplify {topic} down to {ap}, build it this week, and then iterate.",
            ],
            "life": [
                "Take the option where the downside is survivable and the upside is big. {Ap} points that way.",
                "Do the thing that matters more, even if it's riskier. Just keep a way to recover.",
            ],
        },
        "follow": {
            "startup": [
                "What's the biggest assumption in {topic} that you haven't tested yet?",
                "How fast can you get a first version in front of real people? Days, not months.",
                "What would make {kw} ten times cheaper?",
            ],
            "life": [
                "If it fails completely, what's the worst realistic outcome?",
                "What's the smallest version of {kw} you could try this month?",
                "What problem are you actually trying to solve with {kw}?",
            ],
        },
        "peer_agree": [
            "Yeah, I agree with that. Simplify the {kw} part, then speed up.",
            "That's right. Delete the unnecessary stuff first.",
        ],
        "peer_disagree": [
            "I'd push back on that. Being careful is fine, but iteration speed matters more.",
            "I don't think so. Test it for real before arguing about it.",
        ],
        "close": {
            "high": "Okay, that's time. {topic} has potential if you test the riskiest part fast.",
            "low": "Okay, that's time. {topic} needs harder numbers and a real test before I'd believe it.",
        },
    },
    "altman": {
        "open": {
            "startup": [
                "I like where {topic} is going. Who are your first hundred users, and why would they love it, not just like it?",
                "How do you get your first {kw} users? Growth is what decides these things.",
                "Why now? What changed that makes {topic} possible today and not five years ago?",
            ],
            "life": [
                "On {topic}, what's the option value? Does this open more doors than it closes?",
                "If you do {topic}, what do you learn and who do you meet that you wouldn't otherwise?",
                "How much do you really believe in this? Not hype, actual conviction about {topic}.",
            ],
        },
        "agree": {
            "startup": [
                "Right, {ap} is a strong signal. Build on that.",
                "That's good. {Ap} is the kind of thing that compounds.",
            ],
            "life": [
                "{Ap} is a good sign. It suggests you're thinking long term.",
                "Right, {ap} gives you real options. I like that.",
            ],
        },
        "disagree": {
            "startup": [
                "Hm, I'm not convinced by {ap}. That feels like a nice to have, not something people pull from you.",
                "I don't think {ap} is the real driver. Users usually tell you something else.",
            ],
            "life": [
                "I'm not sure {ap} makes this the right move. It might close more doors than it opens.",
                "Hm, {ap} sounds more like an excuse than a reason.",
            ],
        },
        "challenge": {
            "startup": [
                "Okay, but {ap} isn't a growth story yet. What's the thing that compounds?",
                "That's a claim, not evidence. What do users actually do?",
            ],
            "life": [
                "That's fine, but {ap} isn't a plan. What do you actually do in the first month?",
                "Is {ap} really how you feel, or what sounds safe?",
            ],
        },
        "advice": {
            "startup": [
                "My advice, talk to ten more users this week about {ap} and build whatever they keep asking for.",
                "Pick one growth metric for {topic}, track it weekly, and be ruthless about it.",
            ],
            "life": [
                "Take the path that gives you more options and builds skills you can reuse, like {ap}.",
                "Be bold, but make the first step small and reversible.",
            ],
        },
        "follow": {
            "startup": [
                "What does week over week growth look like for {kw} right now, even if it's tiny?",
                "Why will you win and not someone with more money?",
                "What's your unfair advantage on {topic}?",
            ],
            "life": [
                "What would you do if you were certain it would work?",
                "Who's a person that already did this and would give you an honest answer?",
                "In a year, what do you want to be better at because of {kw}?",
            ],
        },
        "peer_agree": [
            "Yeah, I agree. And the {kw} bet gets better if you move fast.",
            "That's right. And I'd add that users will tell you more than we can.",
        ],
        "peer_disagree": [
            "I see it a bit differently. Execution beats the idea, so I'd care less about that.",
            "I'm not sure. Growth would tell us more than opinions would.",
        ],
        "close": {
            "high": "Okay, that's time. I like where {topic} could go, so get it in front of users quickly.",
            "low": "Okay, that's time. I'd want real users and some growth before getting excited about {topic}.",
        },
    },
    "buffett": {
        "open": {
            "startup": [
                "Let's start simple. How does {topic} make money, and why would it keep making money in ten years?",
                "I like to understand a business in a sentence. Can you explain {topic} in one, and tell me who pays?",
                "What protects {kw} from a bigger competitor copying you next year? What's the moat?",
            ],
            "life": [
                "On {topic}, what's the worst that could happen, and could you live with it? I like a margin of safety.",
                "How does {topic} look in twenty years? The short term noise matters less than the long game.",
                "Is {topic} inside what you understand well, or are you stepping outside your circle?",
            ],
        },
        "agree": {
            "startup": [
                "That's sensible. {Ap} is the kind of simple thing I like to see.",
                "Good. {Ap} sounds durable, and durable is what I care about.",
            ],
            "life": [
                "That's sensible. {Ap} sounds like it's built for the long run.",
                "Good. {Ap} is a solid foundation.",
            ],
        },
        "disagree": {
            "startup": [
                "I'm not sold on {ap}. I'd want to see it make money before I believe it.",
                "Hm, {ap} sounds nice, but nice isn't a business.",
            ],
            "life": [
                "I'm not sold on {ap}. It sounds like a story you're telling yourself.",
                "Hm, {ap} gives me pause. It looks like the risk is bigger than the reward.",
            ],
        },
        "challenge": {
            "startup": [
                "I don't follow {ap}, and if I can't follow it, I'd stay away. Where do the dollars come from?",
                "That's a lot of words around {ap}. What's the simple version?",
            ],
            "life": [
                "I don't follow how {ap} protects you if things go wrong.",
                "That's an answer about {ap}, but not about what could go wrong.",
            ],
        },
        "advice": {
            "startup": [
                "I'd keep it simple. Focus on {ap}, don't borrow to grow, and let it compound.",
                "Make {ap} profitable on a small scale first. Growth comes after that.",
            ],
            "life": [
                "Keep a margin of safety, invest in yourself, and choose people of good character. {Ap} fits that.",
                "Be patient. Good decisions about {kw} look obvious in hindsight, and rushing makes them worse.",
            ],
        },
        "follow": {
            "startup": [
                "What happens to {kw} if a recession hits and customers pull back?",
                "Who runs this, and would you trust them with your own money?",
                "What does a customer pay, and how often?",
            ],
            "life": [
                "If this goes wrong, how long could you stay afloat?",
                "Who's a person with good judgment that you could ask about {kw}?",
                "If you had to stick with this for ten years, would you still pick it?",
            ],
        },
        "peer_agree": [
            "I'd second that. Simple and durable beats clever.",
            "Agreed. And {kw} has to survive a bad year, not just a good one.",
        ],
        "peer_disagree": [
            "Respectfully, I disagree. Growth without profit is just a story.",
            "I'd be careful with that. Fast is nice, but surviving is better.",
        ],
        "close": {
            "high": "Well, that's time. {topic} could be a good one if the economics hold up over years.",
            "low": "Well, that's time. I'd keep {topic} small until it proves it can pay for itself.",
        },
    },
}

TAGS = {"curious": "[thoughtfully]", "skeptical": "[skeptical]", "annoyed": "[sighs]", "impressed": "[laughs]"}

STANCE_MOODS = {
    "question": ["curious"],
    "agree": ["impressed", "supportive"],
    "disagree": ["skeptical", "annoyed"],
    "challenge": ["skeptical", "annoyed"],
    "advice": ["supportive", "curious"],
}

TAKES = {
    "jobs": {
        "startup": {
            "high": "{topic} has a point of view, and that's rare. Keep saying no to everything that doesn't serve it.",
            "low": "I couldn't find the one thing {kw} is about. Cut until a stranger gets it in one sentence.",
        },
        "life": {
            "high": "{topic} sounds like something you want, not just something you should do. Trust that.",
            "low": "I heard a lot of reasons around {topic} and not much desire. Figure out what you actually want first.",
        },
    },
    "musk": {
        "startup": {
            "high": "The {kw} idea has real potential if the numbers hold. Test the riskiest assumption fast.",
            "low": "I didn't hear hard numbers or a test for {topic}. Build a rough version and let reality grade it.",
        },
        "life": {
            "high": "{topic} has a big upside and a survivable downside. That's the right shape of risk.",
            "low": "I couldn't tell what the goal behind {topic} really is. Define it, then check the downside.",
        },
    },
    "altman": {
        "startup": {
            "high": "I see a path for {topic} if users really pull it. Get it in front of them and watch growth.",
            "low": "No evidence yet that people want {kw} badly. Talk to users every day until you find the pull.",
        },
        "life": {
            "high": "{topic} gives you options and learning, and that compounds. I'd lean toward it with a small first step.",
            "low": "I'm not sure {topic} opens enough doors. Look for a choice with more upside and learning.",
        },
    },
    "buffett": {
        "startup": {
            "high": "{topic} could be a good business if it makes money simply and keeps doing so. Protect the moat.",
            "low": "I still can't see how {topic} earns money for years. Show me profit before growth.",
        },
        "life": {
            "high": "{topic} looks sound for the long run, especially if you keep a margin of safety.",
            "low": "I'd be careful with {topic}. Build a safety cushion before taking the step.",
        },
    },
}

STEPS = {
    "startup": [
        "Talk to ten real {kw} users this week and write down exactly what they say.",
        "Cut {topic} down to one feature and ship it within seven days.",
        "Write one sentence on who pays you and why they would keep paying.",
        "Find the biggest untested assumption in {topic} and test it cheaply.",
        "Pick one number to track weekly, like signups or repeat use.",
    ],
    "life": [
        "Write down the worst realistic outcome of {topic} and how you would recover.",
        "Talk to two people who already made a similar choice about {kw}.",
        "Run a small, reversible test of {topic} before committing fully.",
        "Decide which you would regret more in ten years: doing it or not doing it.",
        "Set a deadline to decide and put it on your calendar.",
    ],
}


def _fmt(s, f):
    return s.format(**f)


def fill_vars(topic, kw, kw2, ap):
    ap = ap or "that part"
    if not ap.startswith(("the ", "that ")):
        ap = "the " + ap + " part"
    first = topic.split()[0].lower() if topic.split() else ""
    if first in ("a", "an", "the", "my", "our", "your", "i", "we", "it"):  # keep proper nouns like Google intact
        topic = topic[0].lower() + topic[1:]
    return {"topic": topic, "Topic": topic[0].upper() + topic[1:], "kw": kw, "kw2": kw2,
            "ap": ap, "Ap": ap[0].upper() + ap[1:]}


def _pick(rng, options, avoid_texts):
    fresh = [o for o in options if o not in avoid_texts]
    return rng.choice(fresh or options)


def render(pid, kind, ctx, f, rng, used):
    """Pick and fill a template for persona pid. used: set of already rendered texts to avoid repeating."""
    group = T[pid][kind]
    options = group[ctx] if isinstance(group, dict) else group
    rendered = [_fmt(o, f) for o in options]
    return _pick(rng, rendered, used)


def mood_for(stance, rng):
    return rng.choice(STANCE_MOODS[stance])


def with_tag(text, mood, rng):
    tag = TAGS.get(mood)
    if tag and rng.random() < 0.35 and not text.startswith("["):
        return f"{tag} {text}"
    return text


def clean(text):
    """No em or en dashes anywhere in output."""
    return re.sub(r"\s*[–—]\s*", ", ", text)


def summary(personas, ctx, f, answers, rng):
    """Offline summary: heuristic scores from how concrete the answers were."""
    concrete = sum(1 for a in answers if re.search(r"\d|\$|%", a))
    avg_len = sum(len(a.split()) for a in answers) / len(answers) if answers else 0
    bonus = min(2, concrete) + (1 if avg_len >= 15 else 0) - (1 if answers and avg_len < 6 else 0)
    if not answers:
        bonus = -1
    per, scores = [], []
    for pid in personas:
        score = max(2, min(9, round(5 + bonus + rng.choice([-1, 0, 0, 1]))))
        scores.append(score)
        take = TAKES[pid][ctx]["high" if score >= 6 else "low"]
        per.append({"speaker": pid, "take": clean(_fmt(take, f)), "score": int(score)})
    avg = sum(scores) / len(scores)
    if ctx == "life":
        verdict = ("The council leans toward {topic}, as long as you keep a safety net and test it small first." if avg >= 6
                   else "The council isn't convinced yet on {topic}. Get clearer on what you want and how you'd recover if it fails.")
    else:
        verdict = ("The council sees real potential in {topic}, as long as you get it in front of users and keep it focused." if avg >= 6
                   else "The council isn't convinced yet on {topic}. It needs sharper focus, real users and a clearer way to make money.")
    steps = [_fmt(s, f) for s in rng.sample(STEPS[ctx], 3)]
    return {"verdict": clean(_fmt(verdict, f)), "perPersona": per, "nextSteps": [clean(s) for s in steps]}


def closing_turn(personas, summ, ctx, f, rng):
    best = max(summ["perPersona"], key=lambda p: p["score"])
    pid = best["speaker"]
    key = "high" if best["score"] >= 6 else "low"
    text = clean(_fmt(T[pid]["close"][key], f))
    mood = "supportive" if key == "high" else "skeptical"
    return {"speaker": pid, "text": text, "mood": mood, "stance": "advice", "replyTo": "user"}
