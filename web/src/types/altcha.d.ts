declare namespace JSX {
  interface IntrinsicElements {
    'altcha-widget': React.HTMLAttributes<HTMLElement> & {
      challengeurl?: string;
      challengejson?: string;
      hidefooter?: boolean;
      ref?: React.Ref<HTMLElement>;
    };
  }
}
