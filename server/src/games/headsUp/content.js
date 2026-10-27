// Words for Heads Up. Each one should be easy to describe out loud without
// saying the word itself.
export const WORDS = {
  bollywood: [
    'Sholay', 'Dilwale Dulhania Le Jayenge', '3 Idiots', 'Lagaan', 'Kabhi Khushi Kabhie Gham', 'Zindagi Na Milegi Dobara',
    'Dangal', 'Andaz Apna Apna', 'Hera Pheri', 'Chak De! India', 'Taare Zameen Par', 'Queen', 'Gully Boy', 'Jab We Met',
    'Munna Bhai MBBS', 'Baahubali', 'RRR', 'Om Shanti Om', 'Yeh Jawaani Hai Deewani', 'Dil Chahta Hai', 'PK',
    'Item song', 'Slow-motion hero entry', 'Interval twist', 'Lost-and-found twins', 'Dream sequence in Switzerland',
    'Villain\'s secret den', 'Rain song', 'Filmfare award', 'Mogambo',
  ],
  sport: [
    'Sachin Tendulkar', 'MS Dhoni', 'Virat Kohli', 'Mithali Raj', 'PV Sindhu', 'Neeraj Chopra', 'Sunil Chhetri',
    'Gully cricket', 'IPL auction', 'Super over', 'Helicopter shot', 'Googly', 'LBW', 'Duckworth-Lewis', 'Free hit',
    'Kabaddi', 'Kho-kho', 'Badminton', 'Chess grandmaster', 'Olympic gold', 'Penalty shootout', 'Marathon',
    'Third umpire', 'Mexican wave', 'Carrom', 'Table tennis', 'Commentator', 'Yorker', 'Hat-trick', 'Asian Games',
  ],
  food: [
    'Pani puri', 'Masala dosa', 'Biryani', 'Vada pav', 'Momos', 'Butter chicken', 'Rajma chawal', 'Chole bhature',
    'Idli', 'Pav bhaji', 'Jalebi', 'Gulab jamun', 'Rasgulla', 'Filter coffee', 'Cutting chai', 'Maggi', 'Samosa',
    'Dhokla', 'Paneer tikka', 'Kulfi', 'Lassi', 'Pongal', 'Misal pav', 'Poha', 'Thali', 'Mango pickle', 'Appam',
    'Kathi roll', 'Sugarcane juice', 'Bhel puri',
  ],
  hostel: [
    'Night canteen', 'Warden', 'Mess food', 'Bucket bath', 'Extension board', 'Electric kettle', 'Instant noodles',
    'Laundry day', 'Roommate', 'Curfew', 'Wi-Fi password', 'Group study at 3 AM', 'Proxy attendance', 'Fresher',
    'Senior', 'Hostel fest', 'Common room TV', 'Water cooler', 'Mattress', 'Mosquito coil', 'Clothesline',
    'Midnight birthday surprise', 'Borrowed charger', 'Last-minute assignment', 'Exam-eve all-nighter', 'Ironing board',
    'Ghost story', 'Maggi party', 'Parcel from home', 'Guest room',
  ],
  internet: [
    'Meme', 'Reel', 'Influencer', 'Unboxing video', 'Vlog', 'Hashtag', 'Going viral', 'Captcha', 'Buffering',
    'Dark mode', 'Group chat', 'Voice note', 'Blue tick', 'Emoji', 'Podcast', 'Streamer', 'Subscribe button',
    'Phone at 1% battery', 'Online quiz', 'Wordle', 'Screenshot', 'Password reset', 'Spam call', 'Food delivery app',
    'UPI payment', 'Loading spinner', 'Comment section', 'Live stream', 'Profile picture', 'Autocorrect fail',
  ],
};

export const CATEGORY_OPTIONS = [
  { value: 'mix', label: 'Mix it up' },
  { value: 'bollywood', label: 'Bollywood' },
  { value: 'sport', label: 'Cricket & sport' },
  { value: 'food', label: 'Food' },
  { value: 'hostel', label: 'Things in a hostel' },
  { value: 'internet', label: 'Internet culture' },
];

export function wordBank(category) {
  return category === 'mix' || !WORDS[category] ? Object.values(WORDS).flat() : WORDS[category];
}
