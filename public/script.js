// Set variables
const MIN_URL_LENGTH = 29; // Minimum URL length to be shortened

// Get DOM elements
const originalUrlInput = document.getElementById('originalUrl');
const shortenBtn = document.getElementById('shortenBtn');
const resultContainer = document.getElementById('result');
const edurl = document.getElementById('edurl');
const errorDiv = document.getElementById('error');
const reportSection = document.getElementById('report-section');
const reasonInput = document.getElementById('reportReason');
const submitReportBtn = document.getElementById('submitReportBtn');
const reportToggle = document.getElementById('reportBtn');
const reportBox = document.getElementById('report-box');
const linkCount = document.getElementById('linkCount');

// Set current year in footer
document.getElementById('year').textContent = new Date().getFullYear();

/*
Functions
*/

// Shorten URL
async function shortenUrl() {
    const originalUrl = originalUrlInput.value.trim();

    // Reset UI
    errorDiv.classList.add('hidden');
    resultContainer.classList.add('hidden');

    // Client-side validation
    if (!originalUrl) {
        showError('Please enter a URL.');
        return;
    }

    try {
        new URL(originalUrl);
    } catch (_) {
        showError('Please enter a valid URL (including http:// or https://).');
        return;
    }

    if (originalUrl.length < MIN_URL_LENGTH) {
        showError('We can\'t make this URL shorter. (Min: ' + MIN_URL_LENGTH + ' chars)');
        return;
    }

    try {
        shortenBtn.disabled = true;
        shortenBtn.textContent = 'Shortening...';

        const response = await fetch('/api/shorten', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ originalUrl })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Something went wrong');
        }

        // Success
        edurl.href = data.shortUrl;
        edurl.textContent = data.shortUrl;
        resultContainer.classList.remove('hidden');

        // Show report section
        reportSection.classList.remove('hidden');
        reportSection.dataset.code = data.code;

        // Show notification
        showNotification('URL shortened successfully!', 'success');

        // Update link count
        getLinkCount();

    } catch (err) {
        showError(err.message);
    } finally {
        shortenBtn.disabled = false;
        shortenBtn.textContent = 'Shorten';
    }
}

// Submit report
async function submitReport() {
    const code = reportSection.dataset.code;
    const reason = reasonInput.value.trim();

    if (!reason) {
        showNotification('Please provide a reason for the report.', 'error');
        return;
    }

    try {
        const response = await fetch('/api/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ code, reason })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to submit report');
        }

        showNotification('Thank you for your report. We will review it shortly.', 'success');
        reasonInput.value = '';
        reportSection.classList.add('hidden');

    } catch (err) {
        showNotification('Error: ' + err.message, 'error');
    }
}

// Show error
function showError(msg) {
    errorDiv.textContent = msg;
    errorDiv.classList.remove('hidden');
}

// Show notification
function showNotification(message, type = 'info') {
    // Check if notification element exists, if not create it
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.classList.add('toast');
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.background = type === 'success' ? '#10b981' : (type === 'error' ? '#ef4444' : '#6366f1');
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';

    setTimeout(() => {
        toast.style.transform = 'translateY(100px)';
        toast.style.opacity = '0';
    }, 4000);
}

// Copy to clipboard
function copyToClipboard() {
    const url = edurl.href;
    navigator.clipboard.writeText(url).then(() => {
        const btn = document.querySelector('.copy-btn');
        btn.textContent = 'Copied!';
        btn.parentNode.classList.add('success');
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
}

// Get link count
async function getLinkCount() {
    const response = await fetch('/api/link-count');
    const data = await response.json();
    linkCount.textContent = data.count;
}

// Get link count on page load
getLinkCount();

/*
Event Listeners
*/

// Shorten URL by clicking button
shortenBtn.addEventListener('click', shortenUrl);

// Shorten URL by pressing Enter
originalUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        shortenUrl();
    }
});

// Copy to clipboard by clicking button
document.querySelector('.copy-btn').addEventListener('click', copyToClipboard);

// Submit report by clicking button
if (submitReportBtn) {
    submitReportBtn.addEventListener('click', submitReport);
}

// Submit report by pressing Enter
if (reasonInput) {
    reasonInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            submitReport();
        }
    });
}

// Report input toggle
reportToggle.addEventListener('click', () => {
    const isHidden = reportBox.classList.toggle('hidden');
    reportToggle.textContent = isHidden ? 'Report this URL' : '⤬ Close';
    reportToggle.setAttribute('aria-expanded', !isHidden);
});