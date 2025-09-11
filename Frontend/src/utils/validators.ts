export const validateJSON = (jsonString: string): boolean => {
  try {
    const parsed = JSON.parse(jsonString);
    
    // Validate required structure
    return (
      parsed.caseId &&
      parsed.summary &&
      parsed.files &&
      Array.isArray(parsed.files) &&
      parsed.timeline &&
      Array.isArray(parsed.timeline) &&
      parsed.statistics &&
      parsed.suspiciousFindings &&
      Array.isArray(parsed.suspiciousFindings)
    );
  } catch (error) {
    return false;
  }
};

export const validateCaseId = (caseId: string): boolean => {
  return /^[a-zA-Z0-9]{6,}$/.test(caseId);
};