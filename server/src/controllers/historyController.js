import * as historyService from '../services/historyService.js';

export async function getMatch(req, res) {
  res.json({ ok: true, match: await historyService.getMatch(req.params.id) });
}

export async function recent(req, res) {
  res.json({ ok: true, matches: await historyService.recentMatches() });
}
