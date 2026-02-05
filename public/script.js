const originalUrlInput = document.getElementById('originalUrl');
const shortenBtn = document.getElementById('shortenBtn');
const resultContainer = document.getElementById('result');
const edurl = document.getElementById('edurl');
const errorDiv = document.getElementById('error');

async function shortenUrl() {
    const originalUrl = originalUrlInput.value.trim();

    // Reset UI
    errorDiv.classList.add('hidden');
    resultContainer.classList.add('hidden');

    if (!originalUrl) {
        showError('Please enter a valid URL.');
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

        console.log(data);

        if (!response.ok) {
            throw new Error(data.error || 'Something went wrong');
        }

        // Success
        edurl.href = data.shortUrl;
        edurl.textContent = data.shortUrl;
        resultContainer.classList.remove('hidden');

        // Show report section
        document.getElementById('report-section').classList.remove('hidden');
        document.getElementById('report-section').dataset.code = data.code;

    } catch (err) {
        showError(err.message);
    } finally {
        shortenBtn.disabled = false;
        shortenBtn.textContent = 'Shorten';
    }
}

async function submitReport() {
    const reportSection = document.getElementById('report-section');
    const code = reportSection.dataset.code;
    const reasonInput = document.getElementById('reportReason');
    const reason = reasonInput.value.trim();

    console.log(code, reason);

    if (!reason) {
        alert('Please provide a reason for the report.');
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

        console.log(data);

        if (!response.ok) {
            throw new Error(data.error || 'Failed to submit report');
        }

        alert('Thank you for your report. We will review it shortly.');
        reasonInput.value = '';
        reportSection.classList.add('hidden');

    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function showError(msg) {
    errorDiv.textContent = msg;
    errorDiv.classList.remove('hidden');
}

function copyToClipboard() {
    const url = edurl.href;
    navigator.clipboard.writeText(url).then(() => {
        const btn = document.querySelector('.copy-btn');
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
}

// Set current year in footer
document.getElementById('year').textContent = new Date().getFullYear();
