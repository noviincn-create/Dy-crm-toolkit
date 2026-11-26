/** Inline SVG icons (Material-style, 24×24, filled with currentColor). */
export const ICONS = {
  check: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8z\"/></svg>",
  add: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z\"/></svg>",
  search: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14\"/></svg>",
  box: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2m-5 12H9v-2h6zm5-7H4V4h16z\"/></svg>",
  close: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z\"/></svg>",
  error: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m1 15h-2v-2h2zm0-4h-2V7h2z\"/></svg>",
  swap: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M6.99 11 3 15l3.99 4v-3H14v-2H6.99zM21 9l-3.99-4v3H10v2h7.01v3z\"/></svg>",
  left: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z\"/></svg>",
  right: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z\"/></svg>",
  play: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M8 5v14l11-7z\"/></svg>",
  stop: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M6 6h12v12H6z\"/></svg>",
  timer: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M15 1H9v2h6zm-4 13h2V8h-2zm8.03-6.61 1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42A8.96 8.96 0 0 0 12 4a9 9 0 1 0 9 9c0-2.12-.74-4.07-1.97-5.61M12 20a7 7 0 1 1 0-14 7 7 0 0 1 0 14\"/></svg>",
  chart: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z\"/></svg>",
  open: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3z\"/></svg>",
} as const;

export type IconName = keyof typeof ICONS;
