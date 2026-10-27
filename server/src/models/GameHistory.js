import mongoose from 'mongoose';

// Only the finished outcome is saved. Hidden roles, secret words and votes
// stay in memory and disappear with the match unless the game itself
// reveals them in its results.
const gameHistorySchema = new mongoose.Schema(
  {
    roomCode: { type: String, required: true, index: true },
    gameId: { type: String, required: true },
    gameName: { type: String, required: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, required: true },
    headline: { type: String, required: true },
    players: [{ _id: false, name: String, score: Number, rank: Number, note: String }],
    highlights: [String],
  },
  { timestamps: true },
);

export const GameHistory = mongoose.model('GameHistory', gameHistorySchema);
