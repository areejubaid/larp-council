"""Small text helpers: idea classification and key phrase extraction. No dependencies."""
import re
from collections import Counter

STOP = set("""a an the and or but for of to in on at by with from into near about as is are be been being it its this
that these those i me my we our you your they their he she him her what which who whom how why when where do does did
have has had will would can could should may might must not no yes so if then than too very just also only more most
some any all each every both few other such own same up down out off over under again further once here there get got
make made want need like use using used build building app apps thing things idea ideas open new one two ours mine
yours shows show shown helps help lets let allows allow gives give takes take makes lot really actually basically
simply currently already still much many even ever never always often says said say goes going went come comes came
people person""".split())

LIFE_PATTERNS = [
    (r"\bshould i\b", 2), (r"\bquit\b", 2), (r"\bresign", 2), (r"\bmov(e|ing) (to|abroad|out|back)\b", 2),
    (r"\brelocat", 2), (r"\bschool\b", 1), (r"\bcollege\b", 2), (r"\buniversity\b", 1), (r"\bdegree\b", 2),
    (r"\bmajor in\b", 2), (r"\bgrad(uate)? school\b", 2), (r"\bphd\b", 2), (r"\bmasters?\b", 1),
    (r"\brelationship\b", 2), (r"\bmarr(y|iage)\b", 2), (r"\bbreak(ing)? up\b", 2), (r"\bgirlfriend\b", 2),
    (r"\bboyfriend\b", 2), (r"\bdating\b", 1), (r"\bcareer\b", 1), (r"\bgap year\b", 2),
    (r"\b(my|the|this|a) job\b", 2), (r"\bjob offer\b", 2), (r"\bleave my\b", 2), (r"\bretire", 2),
    (r"\bmy (family|parents|wife|husband|partner)\b", 2), (r"\bbuy(ing)? a (house|home|car)\b", 2),
    (r"\bhave (a )?(kid|child|baby)", 2), (r"\bshould we\b", 1), (r"\bam i\b", 1), (r"\bmy life\b", 2),
]
STARTUP_PATTERNS = [
    (r"\bstartup\b", 1), (r"\bapp\b", 2), (r"\bplatform\b", 2), (r"\bsaas\b", 2), (r"\bmarketplace\b", 2),
    (r"\bproduct\b", 1), (r"\busers\b", 1), (r"\bcustomers\b", 1), (r"\bcompany\b", 1), (r"\bbusiness\b", 1),
    (r"\bwebsite\b", 2), (r"\btool\b", 1), (r"\bservice\b", 1), (r"\b(ai|api|software)\b", 2),
    (r"\bfor (people|students|teams|businesses|creators|developers|doctors|drivers)\b", 2),
    (r"\bmap\b|\bmaps\b", 1), (r"\b(uber|airbnb|netflix|google|amazon) for\b", 3), (r"\bsells?\b", 1),
    (r"\bsubscription\b", 2), (r"\bmvp\b", 2), (r"\bdevice\b|\bhardware\b", 2), (r"\bi('m| am) building\b", 2),
]


def classify_idea(idea: str) -> str:
    """Return 'life' for a life decision, else 'startup'."""
    t = (idea or "").lower()
    life = sum(w for pat, w in LIFE_PATTERNS if re.search(pat, t))
    biz = sum(w for pat, w in STARTUP_PATTERNS if re.search(pat, t))
    if re.match(r"\s*(should i|do i|am i|is it (worth|smart|a good idea) (for me )?to)\b", t):
        life += 2
    return "life" if life > biz else "startup"


def _words(text: str):
    """Lowercase words; contractions like they're are skipped."""
    return [w.lower() for w in re.findall(r"[A-Za-z][A-Za-z']{1,}", text or "") if "'" not in w]


def keywords(text: str):
    """Content words ordered by frequency, then first appearance."""
    words = [w for w in _words(text) if w not in STOP and len(w) >= 3]
    counts = Counter(words)
    first = {}
    for i, w in enumerate(words):
        first.setdefault(w, i)
    return sorted(counts, key=lambda w: (-counts[w], first[w]))


IRREGULAR_ING = {"quit": "quitting", "get": "getting", "run": "running", "stop": "stopping", "drop": "dropping",
                 "plan": "planning", "begin": "beginning", "go": "going", "be": "being", "put": "putting",
                 "split": "splitting", "swap": "swapping", "cut": "cutting", "set": "setting", "sit": "sitting"}
_TRAIL = {"to", "the", "a", "an", "for", "and", "of", "or", "in", "on", "with", "my", "your", "at", "from"}


def _gerund(verb: str) -> str:
    v = verb.lower()
    if v in IRREGULAR_ING:
        return IRREGULAR_ING[v]
    if v.endswith("ie"):
        return v[:-2] + "ying"
    if v.endswith("e") and not v.endswith("ee"):
        return v[:-1] + "ing"
    return v + "ing"


def topic_phrase(idea: str, max_words: int = 9) -> str:
    """A short phrase for the idea: its first clause, trimmed. Questions like 'Should I quit my job?' become
    'quitting my job' so the phrase reads naturally inside a sentence."""
    s = re.split(r"[:;\n.!?]| - ", (idea or "").strip())[0]
    s = re.split(r",\s", s)[0] if len(s.split()) > max_words else s
    m = re.match(r"\s*(?:should i|do i|can i|am i going to|am i|would it be (?:smart|wise|good) to|is it (?:worth|smart|a good idea) to)\s+(.*)", s, re.I)
    if m and m.group(1).strip():
        rest = m.group(1).split()
        s = " ".join([_gerund(rest[0])] + rest[1:])
    elif re.match(r"\s*i\s+(?:want|plan|am thinking|'m thinking|wanna)\s+to\s+", s, re.I):
        rest = re.sub(r"^\s*i\s+(?:want|plan|am thinking|'m thinking|wanna)\s+to\s+", "", s, flags=re.I).split()
        if rest:
            s = " ".join([_gerund(rest[0])] + rest[1:])
    # Speak to the user: "my startup" becomes "your startup".
    swap = {"my": "your", "me": "you", "i": "you", "i'm": "you're", "myself": "yourself", "mine": "yours", "our": "your", "we": "you", "us": "you"}
    words = [swap.get(w.lower(), w) for w in s.split()[:max_words]]
    while len(words) > 2 and words[-1].lower().strip(",") in _TRAIL:
        words.pop()
    return " ".join(words).strip(" ,") or "this idea"


def answer_phrase(answer: str, avoid=()):
    """A short noun like phrase from the answer: the longest run of content words, ignoring words in avoid."""
    avoid = set(avoid)
    runs, cur = [], []
    for w in _words(answer):
        if w in STOP or len(w) < 3:
            if cur:
                runs.append(cur)
            cur = []
        else:
            cur.append(w)
    if cur:
        runs.append(cur)
    best, best_key = "", (0, 0)
    for run in runs:
        run = run[:3]
        if all(w in avoid for w in run):
            continue
        key = (len(run), sum(len(w) for w in run))
        if key > best_key:
            best, best_key = " ".join(run), key
    return best
