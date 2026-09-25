// Complete freely redistributable films. Credits stay in each film; full
// copyright, license and conversion details are in public/media/README.md.
export const FEATURE_FILMS = Object.freeze([
  { id: "big-buck-bunny", title: "Big Buck Bunny", duration: 596.46, aspect: 16 / 9, license: "CC BY 3.0" },
  { id: "sintel", title: "Sintel", duration: 888.03, aspect: 40 / 17, license: "CC BY 3.0" },
  { id: "tears-of-steel", title: "Tears of Steel", duration: 734.17, aspect: 640 / 267, license: "CC BY 3.0" },
  { id: "caminandes-gran-dillama", title: "Caminandes: Gran Dillama", duration: 146.05, aspect: 16 / 9, license: "CC BY-SA 3.0" },
].map(film => Object.freeze({ ...film, file: `media/${film.id}.mp4` })));

export const filmForShow = (room, event) => FEATURE_FILMS[((room.number - 1) + (event?.audienceCycle ?? event?.cycle ?? 0)) % FEATURE_FILMS.length];
