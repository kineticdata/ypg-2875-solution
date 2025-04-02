import React, { useRef, useEffect } from 'react';
import WebViewer from '@pdftron/webviewer';
import axios from 'axios';
import { Seal } from '@seal/sdk';

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
      xfdfString,
    });
    const arr = new Uint8Array(data);
    const blob = new Blob([arr], { type: 'application/pdf' });
    console.log('blob', blob);

    // Writes the blob to the Kinetic Data Form's provided triggerField
    let formData = new FormData();
    formData.append('files', blob, 'DD2875 - SAAR');
    console.log(
      'Trigger Field Form File Upload Path',
      triggerField.form().fileUploadPath(),
    );
    axios
      .post(triggerField.form().fileUploadPath(), formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then(({ data }) => {
        triggerField.value(data);
        console.log('Success', data);
      })
      .catch((e) => {
        console.log('Failure', e);
      });
  };

  const applyCreateSignHereElementOverride = async (instance /*WebViewInstance*/) => {
    const { annotationManager, SaveOptions, PDFNet, documentViewer } =
            instance.Core;
    const { SignatureWidgetAnnotation } = instance.Core.Annotations;

    const createSignHereElementOriginal =
      SignatureWidgetAnnotation.prototype
        .createSignHereElement;

    SignatureWidgetAnnotation.prototype.createSignHereElement =
      function (...params) {
        const signHereElement = createSignHereElementOriginal.apply(
          this,
          params,
        );

        signHereElement.addEventListener('click', async (e /*MouseEvent*/) => {
          e.preventDefault();
          e.stopPropagation();          

          await documentViewer.getAnnotationsLoadedPromise();

          const xfdfString = await annotationManager.exportAnnotations();
          const data = await documentViewer.getDocument().getFileData({
            xfdfString,
            flags: SaveOptions.INCREMENTAL,
          });

          await PDFNet.initialize();
          await PDFNet.runWithCleanup(async () => {
            try {
              const seal = Seal.getInstance();

              const identifyResult = await seal.identify({});

              const pdfDoc = await PDFNet.PDFDoc.createFromBuffer(
                new Uint8Array(data),
              );
              await pdfDoc.initSecurityHandler();
              await pdfDoc.lock();

              const pageNumber = this.getPageNumber();
              const page = await pdfDoc.getPage(pageNumber);

              const fieldName = this.getField().name;
              const field = await pdfDoc.getField(fieldName);
              console.log('Field name: ' + fieldName);

              const digsigField =
                await PDFNet.DigitalSignatureField.createFromField(field);
              digsigField.setDocumentPermissions(
                PDFNet.DigitalSignatureField.DocumentPermissions
                  .e_no_changes_allowed,
              );

              // const appearance_image_path = '/apryse.png';
              // const img = await PDFNet.Image.createFromURL(pdfDoc, appearance_image_path);

              const signatureAppearanceImage = await PDFNet.Image.createFromURL(
                pdfDoc,
                identifyResult.imageDataUrl,
              );
              const signatureWidgetAnnotation =
                await PDFNet.SignatureWidget.createFromObj(
                  await field.getSDFObj(),
                );
              await page.annotPushBack(signatureWidgetAnnotation);
              await signatureWidgetAnnotation.createSignatureAppearance(signatureAppearanceImage);

              const padesSigningMode = true;
              await digsigField.createSigDictForCustomSigning(
                'Adobe.PPKLite',
                padesSigningMode
                  ? PDFNet.DigitalSignatureField.SubFilterType
                      .e_ETSI_CAdES_detached
                  : PDFNet.DigitalSignatureField.SubFilterType
                      .e_adbe_pkcs7_detached,
                15000,
              ); // For security reasons, set the contents size to a value greater than but as close as possible to the size you expect your final signature to be, in bytes.
              //          ... or, if you want to apply a certification signature, use CreateSigDictForCustomCertification instead.

              const currentDate = new instance.Core.PDFNet.Date();
              await currentDate.setCurrentTime();
              await digsigField.setSigDictTimeOfSigning(currentDate);
              await pdfDoc.saveMemoryBuffer(
                instance.Core.PDFNet.SDFDoc.SaveOptions.e_incremental,
              );

              const digestAlgType =
                PDFNet.DigestAlgorithm.Type.e_SHA256;
              const pdfDigest = await digsigField.calculateDigest(
                digestAlgType,
              );

              const signerSubject = identifyResult.certificateDetails.subject;
              const signerCert =
                await instance.Core.PDFNet.X509Certificate.createFromBuffer(
                  new TextEncoder().encode(identifyResult.signer),
                );

              const pades_versioned_ess_signing_cert_attribute =
                await instance.Core.PDFNet.DigitalSignatureField.generateESSSigningCertPAdESAttribute(
                  signerCert,
                  digestAlgType,
                );

              const signedAttrs =
                await instance.Core.PDFNet.DigitalSignatureField.generateCMSSignedAttributes(
                  pdfDigest,
                  pades_versioned_ess_signing_cert_attribute,
                );
              const signedAttrsCopy = signedAttrs.slice();

              const signedAttrsDigest =
                await instance.Core.PDFNet.DigestAlgorithm.calculateDigest(
                  digestAlgType,
                  signedAttrs,
                );

              const signatureResult = await seal.sign({
                subject: signerSubject,
                buffer: signedAttrsDigest,
              });

              const signature = new TextEncoder().encode(
                signatureResult.signature,
              );
              const chain = await Promise.all(
                signatureResult.chain.map((value) =>
                  instance.Core.PDFNet.X509Certificate.createFromBuffer(
                    new TextEncoder().encode(value),
                  ),
                ),
              );

              // Then, create ObjectIdentifiers for the algorithms you have used.
              const digest_algorithm_oid =
                await instance.Core.PDFNet.ObjectIdentifier.createFromDigestAlgorithm(
                  digestAlgType,
                );
              const signature_algorithm_oid =
                await instance.Core.PDFNet.ObjectIdentifier.createFromPredefined(
                  instance.Core.PDFNet.ObjectIdentifier.Predefined
                    .e_RSA_encryption_PKCS1,
                );

              // Then, put the CMS signature components together.
              const cms_signature =
                await instance.Core.PDFNet.DigitalSignatureField.generateCMSSignature(
                  signerCert,
                  chain,
                  digest_algorithm_oid,
                  signature_algorithm_oid,
                  signature,
                  signedAttrsCopy,
                );

              const pdfDocBuf = await pdfDoc.saveCustomSignatureBuffer(
                cms_signature,
                digsigField,
              );

              const blob = new Blob([pdfDocBuf], { type: 'application/pdf' });
              console.log(blob);

              instance.UI.loadDocument(blob, { filename: 'myfile.pdf' });
              
            } catch (e) {
              console.error('Exception: ', JSON.stringify(e));
            }
          // }, 'demo:1720412491136:7f813af603000000002f32ff90c3fb493d5bb5535438727a50b7f9ca99');
        }, 'DEMO_KEY');
        });

        return signHereElement;
      };
  };

  useEffect(() => {
    // If you prefer to use the Iframe implementation, you can replace this line with: WebViewer.Iframe(...)
    WebViewer.WebComponent(
      {
        path: '/webviewer/lib',
        initialDoc: '/files/FormDD2875.pdf',
        licenseKey: 'DEMO_KEY', // sign up to get a free trial key at https://dev.apryse.com
        fullAPI: true
      },
      viewer.current,
    ).then((instance) => {
      const { documentViewer, annotationManager, Annotations } = instance.Core;
      const FitMode = instance.UI.FitMode.FitWidth;

      // After the annotations are loaded
      documentViewer.addEventListener('annotationsLoaded', () => {
        // Close the signature panel and set the view width.
        instance.UI.closeElements(['signatureListPanel']);
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
        }
      });

      // Adds an event listener to check when any SignatureField is signed. When this triggers,
      // if the provided signatureField returns a true value from calling isSignedByAppearance()
      // this will call the savePdf function defined above
      annotationManager.addEventListener(
        'annotationChanged',
        (annot, change, info) => {
          if (change === 'add') {
            const sigWidgetAnnots = annotationManager
              .getAnnotationsList()
              .filter(
                (annot) =>
                  annot instanceof Annotations.SignatureWidgetAnnotation,
              );

            let associatedWidget = sigWidgetAnnots.find(
              (assocWidget) => assocWidget.fieldName === signatureField,
            );
            if (associatedWidget.isSignedByAppearance() === true) {
              savePdf(documentViewer, annotationManager);
            }
          }
        },
      );

      applyCreateSignHereElementOverride(instance);
      
    });
  }, []);

  return (
    <div className="WebViewerComponent">
      <div className="webviewer" ref={viewer}></div>
    </div>
  );
};

export default WebViewerComponent;
