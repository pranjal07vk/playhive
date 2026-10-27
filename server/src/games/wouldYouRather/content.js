// [optionA, optionB]
export const QUESTIONS = {
  campus: [
    ['Have every exam be open-book', 'Have every exam be a viva'],
    ['Live in a hostel with perfect Wi-Fi but terrible food', 'Live with amazing mess food but no Wi-Fi'],
    ['Always sit in the front row', 'Never get a seat in the back row again'],
    ['Have an 8 AM class every day', 'Have a 7 PM class every day'],
    ['Submit every assignment a day early', 'Get a guaranteed extension on every assignment'],
    ['Be the group-project leader every time', 'Never be allowed to choose your group'],
    ['Have your crush as your lab partner', 'Have your best friend as your lab partner'],
    ['Know every answer but be unable to speak in class', 'Talk confidently but be wrong half the time'],
    ['Have a free canteen meal daily', 'Have free printing forever'],
    ['Repeat your first year', 'Skip straight to final year without the memories'],
    ['Have your roommate snore', 'Have your roommate talk in their sleep'],
    ['Get placed at a startup you love', 'Get placed at a big company you find boring'],
  ],
  food: [
    ['Give up chai forever', 'Give up coffee forever'],
    ['Eat only Maggi for a month', 'Eat only khichdi for a month'],
    ['Have unlimited pani puri', 'Have unlimited momos'],
    ['Only eat food that is too spicy', 'Only eat food that is too bland'],
    ['Eat biryani for every meal', 'Never eat biryani again'],
    ['Have dessert before every meal', 'Never have dessert again'],
    ['Cook for your friends every weekend', 'Wash their dishes every weekend'],
    ['Eat your mom\'s cooking forever', 'Eat at a five-star restaurant forever'],
    ['Lose your sense of taste', 'Lose your sense of smell'],
    ['Have a lifetime supply of mangoes', 'Have a lifetime supply of jalebis'],
    ['Only drink nimbu pani', 'Only drink lassi'],
    ['Eat street food every day', 'Eat home food every day'],
  ],
  life: [
    ['Be able to fly', 'Be able to become invisible'],
    ['Know how you will die', 'Know when you will die'],
    ['Live without music', 'Live without movies'],
    ['Be famous on the internet', 'Be rich but completely unknown'],
    ['Travel to the past', 'Travel to the future'],
    ['Have a rewind button for your life', 'Have a pause button for your life'],
    ['Always be 10 minutes late', 'Always be 20 minutes early'],
    ['Speak every language', 'Play every musical instrument'],
    ['Live in the mountains', 'Live by the beach'],
    ['Never use social media again', 'Never watch another series again'],
    ['Have a pet dragon', 'Be a dragon'],
    ['Only whisper', 'Only shout'],
  ],
  chaos: [
    ['Have your search history read aloud at a wedding', 'Have your camera roll shown at a family function'],
    ['Accidentally reply-all to the whole college', 'Accidentally video call your professor at 2 AM'],
    ['Sneeze glitter', 'Cry popcorn'],
    ['Narrate everything you do out loud', 'Have a laugh track follow you everywhere'],
    ['Dance whenever you hear a song', 'Sing whenever someone says your name'],
    ['Have every auto driver know your secrets', 'Have your neighbourhood aunty know your grades'],
    ['Fight one horse-sized pigeon', 'Fight a hundred pigeon-sized horses'],
    ['Wear a full sherwani to the gym', 'Wear gym clothes to a wedding'],
    ['Have your phone autocorrect to Shakespeare', 'Have it autocorrect to Bollywood dialogues'],
    ['Be stuck in a lift with your ex', 'Be stuck in a lift with your teacher'],
    ['Only communicate in memes', 'Only communicate in voice notes'],
    ['Have a theme song play when you enter a room', 'Have dramatic lighting follow you'],
  ],
};

export const CATEGORY_OPTIONS = [
  { value: 'mix', label: 'Mix it up' },
  { value: 'campus', label: 'Campus life' },
  { value: 'food', label: 'Food fights' },
  { value: 'life', label: 'Big life questions' },
  { value: 'chaos', label: 'Pure chaos' },
];

export function questionBank(category) {
  return category === 'mix' ? Object.values(QUESTIONS).flat() : QUESTIONS[category];
}
