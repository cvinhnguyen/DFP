"""A newsletter's history and Kysy's next questions, without a database:
what a decision writes into the history, what a change to a draft says, and
how the AI's questions are tidied for the page.

  docker compose exec dashboard python -m unittest discover -s tests -v
"""

import unittest
from datetime import date

from app.services import issues, picks, writing


def pick(issue, section):
    return {"decision": "picked", "issue_id": issue, "section": section}


class PickHistory(unittest.TestCase):
    def test_a_new_pick(self):
        self.assertEqual(picks.history(None, "picked", 7, "events", "Mindtrek", 5),
                         [{"issue_id": 7, "kind": "picked", "section": "events", "item_id": 5, "title": "Mindtrek"}])

    def test_a_move_inside_the_same_newsletter(self):
        entries = picks.history(pick(7, "highlights"), "picked", 7, "events", "Mindtrek", 5)
        self.assertEqual([(e["kind"], e["from_section"], e["section"]) for e in entries], [("moved", "highlights", "events")])

    def test_the_same_section_again_says_nothing(self):
        self.assertEqual(picks.history(pick(7, "events"), "picked", 7, "events", "Mindtrek", 5), [])

    def test_to_another_newsletter(self):
        entries = picks.history(pick(7, "events"), "picked", 8, "events", "Mindtrek", 5)
        self.assertEqual([(e["issue_id"], e["kind"]) for e in entries], [(7, "removed"), (8, "picked")])

    def test_taken_out(self):
        for decision in (None, "later", "dismissed"):
            with self.subTest(decision=decision):
                entries = picks.history(pick(7, "events"), decision, None, None, "Mindtrek", 5)
                self.assertEqual([(e["issue_id"], e["kind"], e["section"]) for e in entries], [(7, "removed", "events")])

    def test_a_decision_about_an_article_never_picked(self):
        self.assertEqual(picks.history({"decision": "later", "issue_id": None, "section": None}, "dismissed", None, None, "x", 5), [])


class DraftHistory(unittest.TestCase):
    def test_what_a_change_says(self):
        entries = issues.changed_entries({"name": "Lokakuu", "subject": "Syksyn tapahtumat",
                                          "planned_for": date(2026, 10, 7), "preheader": "x"})
        self.assertEqual(entries, [{"kind": "renamed", "detail": "Lokakuu"},
                                   {"kind": "subject", "detail": "Syksyn tapahtumat"},
                                   {"kind": "planned", "detail": "2026-10-07"}])

    def test_a_day_taken_away(self):
        self.assertEqual(issues.changed_entries({"planned_for": None}), [{"kind": "planned", "detail": None}])


class NextQuestions(unittest.TestCase):
    def test_tidied(self):
        found = writing.clean_questions(
            ['"Mitä Sitra järjestää keväällä?"', "Mitä Sitra järjestää keväällä?", "- Entä lukioissa",
             "Mitä tekoälystä on kirjoitettu opettajille?", "Lyhyt", "Kuka järjestää ITK:n webinaarit?", "Viides kysymys?"],
            "Mitä tekoälystä on kirjoitettu opettajille?")
        self.assertEqual(found, ["Mitä Sitra järjestää keväällä?", "Entä lukioissa?", "Kuka järjestää ITK:n webinaarit?"])

    def test_nothing_usable(self):
        self.assertEqual(writing.clean_questions(None, "x"), [])
        self.assertEqual(writing.clean_questions("not a list", "x"), [])


if __name__ == "__main__":
    unittest.main()
