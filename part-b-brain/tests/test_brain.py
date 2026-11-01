import os
import unittest

os.environ["BRAIN_OFFLINE"] = "1"  # tests never call the network

from brain.contract import validate_debate_script  # noqa: E402
from brain.mood import mood_for_average  # noqa: E402
from brain.pipeline import run  # noqa: E402
from brain.verdict import embarrassment_score  # noqa: E402

BAD = "Uber for toasters on the blockchain but with AI."
GOOD = (
    "A voice app where you pitch an idea and three sarcastic AI minds, each built from a famous founder's public "
    "thinking style, debate it out loud. We cut every feature except one loop: pitch, score, debate, verdict. "
    "First hundred users are hackathon teams who need feedback tonight, and it costs cents per session to run, "
    "so it can ship by Friday. Each line shows the principle behind it and its source, so the feedback is traceable."
)


def pitch(text, mode="roast", mind=None):
    p = {"sessionId": "t1", "mode": mode, "pitchText": text}
    if mind:
        p["chosenMindId"] = mind
    return p


class MoodThresholds(unittest.TestCase):
    def test_boundaries(self):
        cases = [(5, "slow_clap"), (4.5, "slow_clap"), (4.4, "impressed"), (4.0, "impressed"), (3.9, "skeptical"),
                 (3.0, "skeptical"), (2.9, "sarcastic"), (2.0, "sarcastic"), (1.9, "appalled"), (1.0, "appalled")]
        for avg, mood in cases:
            self.assertEqual(mood_for_average(avg), mood, avg)


class Pipeline(unittest.TestCase):
    def test_bad_idea_has_interruption_and_rage_quit(self):
        s = run(pitch(BAD), use_llm=False)
        validate_debate_script(s)
        self.assertEqual(s["ideaScore"]["mood"], "appalled")
        self.assertTrue(any(l["interruptsLineId"] for l in s["lines"]))
        self.assertTrue(any(l["principleId"] == "rage_quit" for l in s["lines"]))

    def test_good_idea_gets_slow_clap(self):
        s = run(pitch(GOOD), use_llm=False)
        validate_debate_script(s)
        self.assertEqual(s["ideaScore"]["mood"], "slow_clap")
        self.assertEqual(s["lines"][-1]["principleId"], "slow_clap")
        self.assertFalse(any(l["principleId"] == "rage_quit" for l in s["lines"]))

    def test_larp_mode_scores_character_and_excludes_chosen_mind(self):
        s = run(pitch(GOOD, "larp", "perfectionist"), use_llm=False)
        validate_debate_script(s)
        self.assertIsInstance(s["characterScore"], int)
        self.assertNotIn("perfectionist", {l["mindId"] for l in s["lines"]})

    def test_every_bad_mood_has_an_interruption_in_every_mode(self):
        pitches = ["Meh app that does stuff for people.", BAD]
        for mind in (None, "perfectionist", "engineer", "operator"):
            for text in pitches:
                s = run(pitch(text, "larp", mind) if mind else pitch(text), use_llm=False)
                if s["ideaScore"]["mood"] in ("appalled", "sarcastic"):
                    self.assertTrue(any(l["interruptsLineId"] for l in s["lines"]), (mind, text, s["ideaScore"]["mood"]))

    def test_roast_mode_has_no_character_score(self):
        self.assertIsNone(run(pitch(BAD), use_llm=False)["characterScore"])

    def test_every_line_has_a_source_note(self):
        for l in run(pitch(BAD), use_llm=False)["lines"]:
            self.assertTrue(l["sourceNote"])

    def test_larp_without_mind_is_rejected(self):
        with self.assertRaises(ValueError):
            run(pitch(GOOD, "larp"), use_llm=False)

    def test_unknown_mind_is_rejected(self):
        with self.assertRaises(ValueError):
            run(pitch(GOOD, "larp", "nobody"), use_llm=False)


class Verdict(unittest.TestCase):
    def test_range_and_direction(self):
        self.assertEqual(embarrassment_score(5), 0)
        self.assertEqual(embarrassment_score(1), 100)
        self.assertGreater(embarrassment_score(3, 10), embarrassment_score(3, 90))


if __name__ == "__main__":
    unittest.main()
