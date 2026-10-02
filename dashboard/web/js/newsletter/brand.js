// The banners and logo new emails start with. The association's own are in
// img/brand/ (its README says where they are from); an admin can put other
// pictures in their place on Asetukset (GET /api/brand), and the editor
// calls setBrand with them before it builds a template.
// Jira: DM42-37

export const BRAND_DEFAULTS = {
  newsletter: { src: '/img/brand/uutiskirje.png', width: 1128, height: 222 },
  members: { src: '/img/brand/jasenkirje.png', width: 1128, height: 222 },
  logo: { src: '/img/brand/eoppimiskeskus.png', width: 304, height: 60 },
};

const chosen = { ...BRAND_DEFAULTS };

// newsletter, members or logo: { src, width, height }
export function brand(which) {
  return chosen[which];
}

// What the admins chose, as GET /api/brand gives it: null for one means the
// association's own.
export function setBrand(fromServer) {
  for (const which of Object.keys(BRAND_DEFAULTS)) {
    const picked = fromServer && fromServer[which];
    chosen[which] = picked && picked.src ? picked : BRAND_DEFAULTS[which];
  }
}
