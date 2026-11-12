document.addEventListener('DOMContentLoaded', () => {
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const enabledInput = document.getElementById('enabled');
  const switchLabel = document.getElementById('switchLabel');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');

  function updateSwitchUI(isEnabled) {
    enabledInput.checked = isEnabled;
    if (isEnabled) {
      switchLabel.textContent = 'ON';
      switchLabel.className = 'switch-label';
    } else {
      switchLabel.textContent = 'OFF';
      switchLabel.className = 'switch-label disabled';
    }
  }

  // Load existing settings
  chrome.storage.local.get(['boxEmail', 'boxPassword', 'boxEnabled'], (res) => {
    if (res.boxEmail) emailInput.value = res.boxEmail;
    if (res.boxPassword) passwordInput.value = res.boxPassword;
    const isEnabled = res.boxEnabled !== false; // default true
    updateSwitchUI(isEnabled);
  });

  // Instant toggle on switch change
  enabledInput.addEventListener('change', () => {
    const isEnabled = enabledInput.checked;
    updateSwitchUI(isEnabled);

    chrome.storage.local.set({ boxEnabled: isEnabled }, () => {
      statusDiv.textContent = isEnabled ? 'Auto-Login Enabled' : 'Auto-Login Disabled';
      statusDiv.className = isEnabled ? 'success' : '';
      statusDiv.style.color = isEnabled ? '#16a34a' : '#64748b';
      setTimeout(() => {
        statusDiv.textContent = '';
      }, 2000);
    });
  });

  // Save button for email and password
  saveBtn.addEventListener('click', () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const enabled = enabledInput.checked;

    chrome.storage.local.set({
      boxEmail: email,
      boxPassword: password,
      boxEnabled: enabled
    }, () => {
      statusDiv.textContent = 'Settings saved!';
      statusDiv.className = 'success';
      statusDiv.style.color = '#16a34a';
      setTimeout(() => {
        statusDiv.textContent = '';
      }, 2500);
    });
  });
});
