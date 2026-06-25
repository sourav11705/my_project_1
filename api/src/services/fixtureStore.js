const fs = require('fs');
const path = require('path');

const FIXTURE_DIR = '/home/team/shared/mock-data-fixtures';

function loadJson(name) {
  const full = path.join(FIXTURE_DIR, name);
  return JSON.parse(fs.readFileSync(full, 'utf-8'));
}

const fixtureMap = {
  quick_commerce: loadJson('quick-commerce.json'),
  cab: loadJson('cabs.json'),
  food_delivery: loadJson('food-delivery.json'),
};

function chooseScenario(category, payload = {}) {
  const scenarios = fixtureMap[category] || [];
  if (!scenarios.length) return null;

  const requestedScenarioId = payload.scenarioId;
  if (requestedScenarioId) {
    const matched = scenarios.find((item) => item.scenarioId === requestedScenarioId);
    if (matched) return matched;
  }

  const cityCode = (payload.userContext?.cityCode || '').toUpperCase();
  const pincode = payload.query?.pincode || payload.userContext?.pincode;

  if (cityCode) {
    const matchedByCity = scenarios.find((item) => item.compareRequest?.userContext?.cityCode === cityCode);
    if (matchedByCity) return matchedByCity;
  }

  if (pincode) {
    const matchedByPincode = scenarios.find((item) => item.pincode === pincode);
    if (matchedByPincode) return matchedByPincode;
  }

  return scenarios[0];
}

module.exports = { chooseScenario };