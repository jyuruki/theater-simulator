// Original, fictional programming shared by the signs and ticket kiosks.
// These are simulator sessions, never the cinema's current listings.
const titles = [
  "The Starlit Current",
  "Paper Planets",
  "Lantern City",
  "Aloha, Tomorrow",
  "Pacific Afterglow",
  "Neon Reef",
  "The Long Way Home",
  "Orbital Tide",
  "Summer at Sea",
  "The Quiet Volcano",
  "Last Train to Hilo",
  "Small Wonders",
  "Mango Moon",
  "Midnight on Mauna",
];
const palettes = ["#ef6178", "#58c7cf", "#eac277"];
export const SHOWS = Object.freeze(
  titles.map((title, index) =>
    Object.freeze({
      id: `show-${index + 1}`,
      title,
      auditorium: index + 1,
      rating: [
        "PG",
        "PG",
        "PG-13",
        "PG",
        "PG",
        "PG-13",
        "PG",
        "PG",
        "PG",
        "PG-13",
        "PG",
        "G",
        "PG",
        "PG-13",
      ][index],
      minutes: 94 + ((index * 7) % 43),
      accent: palettes[Math.floor(index / 5)],
      times: Object.freeze([
        `${12 + (index % 3)}:${index % 2 ? "45" : "10"}`,
        `${16 + (index % 3)}:20`,
        `${19 + (index % 3)}:35`,
      ]),
    }),
  ),
);

export const CONCESSION_MENU = Object.freeze([
  Object.freeze({
    id: "popcorn",
    name: "Fresh popcorn",
    detail: "A warm tub of the cinema classic",
    preparation: 4,
  }),
  Object.freeze({
    id: "garlic-fries",
    name: "Garlic fries",
    detail: "Crisp fries, garlic and herbs",
    preparation: 10,
  }),
  Object.freeze({
    id: "nachos",
    name: "Loaded nachos",
    detail: "Tortilla chips and melted cheese",
    preparation: 7,
  }),
  Object.freeze({
    id: "burger",
    name: "Lanai burger",
    detail: "Grilled burger with a side of fries",
    preparation: 12,
  }),
]);
