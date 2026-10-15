import React from 'react';

/**
 * react-native-pdf is loaded lazily, only when a PDF is actually shown.
 * If its native module has a problem, the app still starts and the
 * ErrorBoundary shows the exact error instead of the app closing.
 */
let PdfComponent: any = null;

function loadPdf() {
  if (!PdfComponent) PdfComponent = require('react-native-pdf').default;
  return PdfComponent;
}

const PdfView = React.forwardRef<any, any>((props, ref) => {
  const Pdf = loadPdf();
  return <Pdf ref={ref} {...props} />;
});

export default PdfView;
