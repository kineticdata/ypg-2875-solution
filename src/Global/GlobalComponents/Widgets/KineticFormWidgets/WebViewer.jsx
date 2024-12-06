import React, { useRef, useEffect } from 'react';
import WebViewer from '@pdftron/webviewer';
import axios from 'axios';

const WebViewerComponent = ({ values, triggerField, signatureField }) => {
  // Log the parameters passed in from the Form script
  // The values parameter is the JSON object containing keys that map to PDF fields,
  // and values that map to the Kinetic Data Form's Page 1 user entries
  console.log('values', values);
  // The triggerField parameter is the Kinetic Data Form's Page 2 attachment field
  // that will house the PDF after it is signed.
  console.log('triggerField', triggerField);
  // The signatureField parameter is the PDF field's name that will trigger the savePdf
  // function that writes the signed PDF to the attachment field.
  console.log('signatureField', signatureField);

  const viewer = useRef(null);

  // The savePdf function saves and writes the PDF to the provided triggerField,
  // and then allows for the form to be submitted. The Form is conditionally
  // submittable based on the triggerField being populated with data (which it
  // is after calling savePdf)
  const savePdf = async (documentViewer, annotationManager) => {
    // console.log('triggerField', triggerField);

    const doc = documentViewer.getDocument();
    const xfdfString = await annotationManager.exportAnnotations();
    const data = await doc.getFileData({
      // saves the document with annotations in it
      xfdfString
    });
    const arr = new Uint8Array(data);
    const blob = new Blob([arr], { type: 'application/pdf' });
    console.log('blob', blob);

    // Writes the blob to the Kinetic Data Form's provided triggerField
    let formData = new FormData();
    formData.append('files', blob, 'DD2875 - SAAR');
    console.log('Trigger Field Form File Upload Path', triggerField.form().fileUploadPath());
    axios
      .post(triggerField.form().fileUploadPath(), formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then(({ data }) => {
        triggerField.value(data);
        console.log('Success', data);
      })
      .catch(e => {
        console.log('Failure', e);
      });
  };
 
  useEffect(() => {
    // If you prefer to use the Iframe implementation, you can replace this line with: WebViewer.Iframe(...)
    WebViewer.WebComponent(
      {
        path: '/webviewer/lib',
        initialDoc: '/files/FormDD2875.pdf',
        licenseKey: 'DEMO_KEY',  // sign up to get a free trial key at https://dev.apryse.com
      },
      viewer.current,
    ).then((instance) => {
      const { documentViewer, annotationManager, Annotations } = instance.Core;
      const FitMode = instance.UI.FitMode;

      // After the annotations are loaded
      documentViewer.addEventListener('annotationsLoaded', () => {
        // Close the signature panel and set the view width.
        instance.UI.closeElements([ 'signatureListPanel' ]);
        instance.UI.setFitMode(FitMode.FitToWidth);
        
        const fieldManager = annotationManager.getFieldManager();

        // Iterate over the provided keys in values and set the PDF fields
        // to the provided key values
        for (const field in values) {
          // console.log(field, values[field]);
          const writeToField = fieldManager.getField(field);
          if (writeToField) {
            writeToField.setValue(values[field]);
          }
        };
      });

      // Adds an event listener to check when any SignatureField is signed. When this triggers,
      // if the provided signatureField returns a true value from calling isSignedByAppearance()
      // this will call the savePdf function defined above
      annotationManager.addEventListener('annotationChanged', (annot, change, info) => {
        if (change === "add") {
          const sigWidgetAnnots = annotationManager.getAnnotationsList().filter(
            annot => annot instanceof Annotations.SignatureWidgetAnnotation
          );

          let associatedWidget = sigWidgetAnnots.find( assocWidget => assocWidget.fieldName === signatureField );
          if (associatedWidget.isSignedByAppearance() === true) {
            savePdf(documentViewer, annotationManager);
          };
        }
      })      
    });
  }, []);

  return (
    <div className="WebViewerComponent">
      <div className="webviewer" ref={viewer}></div>
    </div>
  );
};

export default WebViewerComponent;
