import Script from 'next/script';

export default function GoogleAnalytics() {
  return (
    <>
      <Script async src="https://www.googletagmanager.com/gtag/js?id=G-233K04KGES" />
      <Script
        id="google-analytics"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}

            gtag('js', new Date());
            gtag('config', 'G-233K04KGES');
        `,
        }}
      />
    </>
  );
}
