declare namespace JSX {
  interface IntrinsicElements {
    'altcha-widget': React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        challengeurl?: string;
        challengejson?: string;
        hidefooter?: boolean;
      },
      HTMLElement
    >;
  }
}
