declare namespace JSX {
  interface IntrinsicElements {
    'altcha-widget': React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        challengeurl?: string;
        hidefooter?: boolean;
      },
      HTMLElement
    >;
  }
}
