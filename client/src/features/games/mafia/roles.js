// Role cards for Mafia: icon, name, and what the role can do.
export const ROLES = {
  mafia: { icon: '🗡️', label: 'Mafia', tone: 'gulal', power: 'Each night, agree with your team on one person to eliminate. By day, blend in.' },
  doctor: { icon: '🩺', label: 'Doctor', tone: 'parrot', power: 'Each night, protect one person (even yourself), just not the same person two nights running.' },
  detective: { icon: '🔍', label: 'Detective', tone: 'peacock', power: 'Each night, check one player and secretly learn if they are Mafia.' },
  villager: { icon: '🏡', label: 'Villager', tone: 'marigold', power: 'No night powers, just your instincts. Find the Mafia and vote them out.' },
};

export const roleOf = (role) => ROLES[role] ?? { icon: '❔', label: 'Unknown', tone: 'dark', power: '' };
