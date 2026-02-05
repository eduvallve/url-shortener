// Get DOM elements
const originalUrlInput = document.getElementById('originalUrl');
const shortenBtn = document.getElementById('shortenBtn');
const resultContainer = document.getElementById('result');
const edurl = document.getElementById('edurl');
const errorDiv = document.getElementById('error');
const reportSection = document.getElementById('report-section');
const reasonInput = document.getElementById('reportReason');

// Set current year in footer
document.getElementById('year').textContent = new Date().getFullYear();

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

    } catch (err) {
        showError(err.message);
    } finally {
        shortenBtn.disabled = false;
        shortenBtn.textContent = 'Shorten';
    }
}

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

function showError(msg) {
    errorDiv.textContent = msg;
    errorDiv.classList.remove('hidden');
}

/**
 * Simple notification system to replace alert()
 */
function showNotification(message, type = 'info') {
    // Check if notification element exists, if not create it
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 2rem;
            right: 2rem;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
            z-index: 1000;
            transition: opacity 0.3s, transform 0.3s;
            transform: translateY(100px);
            opacity: 0;
        `;
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

function copyToClipboard() {
    const url = edurl.href;
    navigator.clipboard.writeText(url).then(() => {
        const btn = document.querySelector('.copy-btn');
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.parentNode.classList.add('success');
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
}

// Event Listeners
shortenBtn.addEventListener('click', shortenUrl);

// Keyboard support: Allow pressing Enter to shorten
originalUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        shortenUrl();
    }
});

document.querySelector('.copy-btn').addEventListener('click', copyToClipboard);

const submitReportBtn = document.getElementById('submitReportBtn');
if (submitReportBtn) {
    submitReportBtn.addEventListener('click', submitReport);
}

// Keyboard support for report reason
if (reasonInput) {
    reasonInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            submitReport();
        }
    });
}
