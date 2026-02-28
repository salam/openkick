interface PlayerInput {
  id: number;
  name: string;
  lastNameInitial: string | null;
}

interface PlayerInitial {
  id: number;
  initial: string;
}

export function computeInitials(players: PlayerInput[]): PlayerInitial[] {
  const firstLetterCount = new Map<string, number>();
  for (const p of players) {
    const letter = p.name.charAt(0).toUpperCase();
    firstLetterCount.set(letter, (firstLetterCount.get(letter) || 0) + 1);
  }

  return players.map(p => {
    const letter = p.name.charAt(0).toUpperCase();
    const hasCollision = (firstLetterCount.get(letter) || 0) > 1;

    if (hasCollision && p.lastNameInitial) {
      return { id: p.id, initial: `${letter}. ${p.lastNameInitial.toUpperCase()}.` };
    }
    return { id: p.id, initial: `${letter}.` };
  });
}
