// Words to draw. Letters and spaces only, so the hint pattern stays simple.
export const WORDS = {
  easy: [
    'kite', 'samosa', 'umbrella', 'banana', 'rainbow', 'elephant', 'bicycle', 'mango', 'peacock', 'clock',
    'camera', 'guitar', 'ladder', 'rocket', 'pizza', 'cupcake', 'snail', 'tree', 'house', 'fish',
    'sun', 'star', 'moon', 'apple', 'chair', 'book', 'shoe', 'candle', 'balloon', 'butterfly',
    'spectacles', 'ice cream', 'pencil', 'turtle', 'drum',
  ],
  desi: [
    'auto rickshaw', 'diya', 'cricket bat', 'chai', 'pani puri', 'rangoli', 'jalebi', 'pressure cooker', 'tiffin box', 'dosa',
    'tabla', 'mehendi', 'scooter', 'coconut', 'lassi', 'cycle rickshaw', 'bindi', 'kulfi', 'mosquito', 'ceiling fan',
    'steel tumbler', 'kurta', 'temple bell', 'railway station', 'chapati', 'cow', 'tuk tuk', 'vada pav', 'kabaddi', 'flower garland',
    'bus stop', 'gully cricket', 'monsoon', 'lunch box', 'sitar',
  ],
  tricky: [
    'traffic jam', 'power cut', 'group selfie', 'wifi', 'deadline', 'alarm clock', 'exam hall', 'hostel room', 'birthday bash', 'traffic signal',
    'lighthouse', 'volcano', 'parachute', 'submarine', 'astronaut', 'skeleton', 'treasure map', 'waterfall', 'robot', 'shadow',
    'echo', 'sunrise', 'escalator', 'thunderstorm', 'scarecrow', 'magnet', 'night shift', 'online class', 'last bench', 'proxy attendance',
    'dance floor', 'road trip', 'phone charger', 'plot twist', 'sleepwalking',
  ],
};

export const DIFFICULTY_OPTIONS = [
  { value: 'mix', label: 'Mix it up' },
  { value: 'easy', label: 'Easy doodles' },
  { value: 'desi', label: 'Desi classics' },
  { value: 'tricky', label: 'Tricky ideas' },
];

export function wordBank(difficulty) {
  return difficulty === 'mix' ? Object.values(WORDS).flat() : WORDS[difficulty];
}
