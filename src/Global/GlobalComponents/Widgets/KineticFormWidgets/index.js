import { Markdown } from './markdown';
import WebViewerComponent from './WebViewer';
import { renderIntoDom } from '@kineticdata/bundle-common';

// Ensure the bundle global object exists
const bundle = typeof window.bundle !== 'undefined' ? window.bundle : {};
// Create helpers namespace
bundle.helpers = bundle.helpers || {};

// Add widgets to helpers namespace of the bundle object
bundle.helpers.Markdown = Markdown;

bundle.helpers.webViewer = (div, fieldMapping, triggerField, signatureField) => {
    renderIntoDom(<WebViewerComponent signatureField={signatureField} triggerField={triggerField} values={fieldMapping}/>, div)
};
