import React, { useRef, useEffect } from 'react';
import WebViewer from '@pdftron/webviewer';
import axios from 'axios';

const WebViewerComponent = ({ values, triggerField, signatureField }) => {
  console.log('values', values);
  console.log('triggerField', triggerField);
  console.log('signatureField', signatureField);

  const viewer = useRef(null);

  const savePdf = async (documentViewer, annotationManager) => {
    console.log('triggerField', triggerField);

    const doc = documentViewer.getDocument();
    const xfdfString = await annotationManager.exportAnnotations();
    const data = await doc.getFileData({
      // saves the document with annotations in it
      xfdfString
    });
    const arr = new Uint8Array(data);
    const blob = new Blob([arr], { type: 'application/pdf' });
    console.log('blob', blob);

    // Add code for handling Blob here
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

  // if using a class, equivalent of componentDidMount 
  useEffect(() => {
    // If you prefer to use the Iframe implementation, you can replace this line with: WebViewer.Iframe(...)
    WebViewer.WebComponent(
      {
        path: '/webviewer/lib',
        initialDoc: '/files/FormDD2875.pdf',
        licenseKey: 'demo:1731530825801:7efb63f40300000000b8d4474598019fd040ec88b769e031fb97199dad',  // sign up to get a free trial key at https://dev.apryse.com
      },
      viewer.current,
    ).then((instance) => {
      const { documentViewer, annotationManager, Annotations } = instance.Core;
      const FitMode = instance.UI.FitMode;

      // After the annotations are loaded, print out all field name and values.
      documentViewer.addEventListener('annotationsLoaded', () => {
        instance.UI.closeElements([ 'signatureListPanel' ]);
        instance.UI.setFitMode(FitMode.FitWidth);
        
        const fieldManager = annotationManager.getFieldManager();

        for (const field in values) {
          console.log(field, values[field]);
          const writeToField = fieldManager.getField(field);
          if (writeToField) {
            writeToField.setValue(values[field]);
          }
        };
      });

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
