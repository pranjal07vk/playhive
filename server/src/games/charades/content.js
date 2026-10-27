// Things to act out without speaking. Each should be mimeable in under a minute.
export const WORDS = {
  movies: [
    'Sholay', 'Lagaan', '3 Idiots', 'Dangal', 'Kuch Kuch Hota Hai', 'Mughal-e-Azam', 'Taare Zameen Par', 'Chak De! India',
    'Baahubali', 'RRR', 'Jurassic Park', 'Titanic', 'The Lion King', 'Spider-Man', 'Harry Potter', 'Finding Nemo',
    'Frozen', 'Jaws', 'The Avengers', 'Krrish', 'Koi... Mil Gaya', 'Mr. India', 'Padman', 'Toilet: Ek Prem Katha',
    'Swades', 'Bhaag Milkha Bhaag', 'Jumanji', 'Home Alone',
  ],
  songs: [
    'Chaiyya Chaiyya', 'Kala Chashma', 'Jai Ho', 'Naatu Naatu', 'Tum Hi Ho', 'Kajra Re', 'Gallan Goodiyaan',
    'London Thumakda', 'Desi Girl', 'Zoobi Doobi', 'Badtameez Dil', 'Dhoom Machale', 'Senorita', 'Kar Har Maidaan Fateh',
    'Lungi Dance', 'Happy Birthday', 'Twinkle Twinkle Little Star', 'We Will Rock You', 'Baby Shark', 'Macarena',
    'Ek Do Teen', 'Dil Se Re', 'Jhoome Jo Pathaan', 'Sooraj Dooba Hai', 'Malhari', 'Kesariya',
  ],
  actions: [
    'Brushing your teeth', 'Riding a scooter in traffic', 'Catching a cricket ball', 'Flying a kite', 'Making rotis',
    'Taking a selfie', 'Waiting for a late bus', 'Bargaining at a market', 'Changing a baby\'s nappy', 'Walking a stubborn dog',
    'Doing yoga', 'Hailing an auto', 'Opening a stuck jar', 'Watering plants', 'Playing the tabla', 'Ironing a shirt',
    'Sneaking into class late', 'Finding Wi-Fi signal', 'Swatting a mosquito', 'Climbing a mountain', 'Rowing a boat',
    'Juggling', 'Building a sandcastle', 'Getting a haircut', 'Stepping on Lego', 'Learning to swim', 'Sleeping in an exam',
  ],
  festivals: [
    'Lighting diyas on Diwali', 'Playing Holi', 'Flying kites on Makar Sankranti', 'Garba', 'Dandiya', 'Eid biryani feast',
    'Christmas tree decorating', 'Durga Puja pandal hopping', 'Onam boat race', 'Pongal rice boiling over',
    'Rakhi tying', 'Ganesh Chaturthi procession', 'Bhangra on Baisakhi', 'Lohri bonfire', 'Rangoli making',
    'Bursting crackers', 'Bihu dance', 'Making modaks', 'Wedding baraat', 'Mehendi ceremony', 'Breaking the dahi handi',
    'Karva Chauth moon sighting', 'New Year countdown', 'Gifting sweets', 'Pookalam flower carpet', 'Hornbill Festival',
  ],
};

export const CATEGORY_OPTIONS = [
  { value: 'mix', label: 'Mix it up' },
  { value: 'movies', label: 'Movies' },
  { value: 'songs', label: 'Songs' },
  { value: 'actions', label: 'Actions' },
  { value: 'festivals', label: 'Indian festivals & traditions' },
];

export function wordBank(category) {
  return category === 'mix' || !WORDS[category] ? Object.values(WORDS).flat() : WORDS[category];
}
