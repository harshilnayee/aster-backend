const { resolveFillFormId } = require("./pdf/bulkFormValues");

const PUBLIC_FORM_LABELS = {
  preMedical: "Personal / Pre-medical",
  postMedical: "Post-medical & fitness",
  eyeExam: "Eye examination",
  form33: "Form 33 fitness certificate",
  healthRegister: "Health register (Form 32)",
  xrayReport: "X-ray report",
  "4-form-airport-bohw": "Airport BOHW",
  "5-form-height-pass": "Height pass",
  "10-form-ophthal-form-6": "Ophthal form 6",
  "11-form-audiometry-front": "Audiometry (front)",
  "12-form-audiometry-back": "Audiometry (back)",
  "15-form-vaccination-front": "Vaccination (front)",
  "16-form-vaccination-back": "Vaccination (back)",
  "13-form-pft-front": "PFT (front)",
  "14-form-pft-back": "PFT (back)",
  "17-form-food-handler-certificate": "Food handler certificate",
  "18-form-vaccine-ircs-forms-2": "Vaccine certificate",
  "19-form-ecg": "ECG",
  "25-form-for-medical-fitness-certificate-format": "Medical fitness certificate",
  "26-form-death-certificate": "Death certificate",
  "35-form-airport-bohw-ht-front": "Airport BOHW-HT (front)",
  "36-form-airport-bohw-ht-back": "Airport BOHW-HT (back)"
};

function formDate(savedAt) {
  if (!savedAt) return "";
  const d = new Date(savedAt);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function isCompletedForm(entry) {
  return Boolean(entry?.savedAt && entry.isDraft !== true);
}

function isAllowedPublicFormKey(formKey) {
  return Object.prototype.hasOwnProperty.call(PUBLIC_FORM_LABELS, formKey);
}

function isDownloadableFormKey(formKey) {
  return Boolean(resolveFillFormId(formKey));
}

function listCompletedForms(forms) {
  const src = forms && typeof forms === "object" ? forms : {};
  return Object.entries(PUBLIC_FORM_LABELS)
    .filter(([key]) => isCompletedForm(src[key]))
    .map(([key, label]) => ({
      key,
      label,
      completedOn: formDate(src[key].savedAt),
      downloadable: isDownloadableFormKey(key)
    }));
}

module.exports = {
  PUBLIC_FORM_LABELS,
  formDate,
  isCompletedForm,
  isAllowedPublicFormKey,
  isDownloadableFormKey,
  listCompletedForms
};
