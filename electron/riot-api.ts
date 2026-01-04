import { Database } from './database.js';

export async function fetchMatchMetadata(
  matchId: string,
  region: string,
  db: Database
): Promise<{
  matchId: string;
  placement: number;
  augments: string[];
  traits: any[];
  finalBoard: any[];
  fetchedAt: number;
}> {
  // Check cache first
  const cached = db.getMatchMetadata(matchId);
  if (cached) {
    return cached;
  }

  // Get API key from settings
  const settings = db.getSettings();
  const apiKey = settings['riot_api_key'];
  if (!apiKey) {
    throw new Error('Riot API key not configured');
  }

  // Fetch from Riot API
  const baseUrl = `https://${region}.api.riotgames.com`;
  const url = `${baseUrl}/tft/match/v1/matches/${matchId}`;

  const response = await fetch(url, {
    headers: {
      'X-Riot-Token': apiKey,
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Match not found');
    } else if (response.status === 403) {
      throw new Error('Invalid API key');
    } else if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    throw new Error(`API error: ${response.statusText}`);
  }

  const data = await response.json();

  // Extract player data (assuming we want the first player or need to identify which player)
  // For v0, we'll take the first participant
  const participant = data.info.participants[0];

  const placement = participant.placement;
  const augments = participant.augments || [];
  const traits = participant.traits || [];
  const finalBoard = participant.units || [];

  // Save to cache
  db.saveMatchMetadata(matchId, placement, augments, traits, finalBoard, data);

  return {
    matchId,
    placement,
    augments,
    traits,
    finalBoard,
    fetchedAt: Date.now(),
  };
}
