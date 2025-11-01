// === pagos con el bnb ===
let bnbQrId = null;
let bnbCheckInterval = null;

async function openBnbQrModal(ci) {
    const modal = document.getElementById('bnb-qr-modal');
    const canvas = document.getElementById('bnb-qr-canvas');
    const idSpan = document.getElementById('bnb-qr-id');
    const status = document.getElementById('bnb-status');

    const student = await firebaseServices.students.getStudentByCI(ci);
    if (!student) return;

    const concept = 'Mensualidad';
    const amount = 150;
    const gloss = `Pago ${concept} - ${student.name} (CI: ${ci})`;

    const payload = {
        currency: "BOB",
        gloss: gloss,
        amount: amount.toString(),
        singleUse: "true",
        expirationDate: new Date(Date.now() + 30*60000).toISOString().split('T')[0]
    };

    try {
        const response = await fetch('https://qrsimpleapiv2.azurewebsites.net/api/v1/main/getQRWithImageAsync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (data.success && data.qr) {
            const img = new Image();
            img.src = 'data:image/png;base64,' + data.qr;
            img.onload = () => {
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
            };

            bnbQrId = data.id;
            idSpan.textContent = bnbQrId;
            modal.classList.remove('hidden');

            bnbCheckInterval = setInterval(() => checkBnbPaymentStatus(ci, concept, amount), 5000);
        } else {
            alert("Error al generar QR: " + data.message);
        }
    } catch (err) {
        console.error(err);
        alert("Error de conexión con BNB");
    }
}

async function checkBnbPaymentStatus(ci, concept, amount) {
    if (!bnbQrId) return;

    try {
        const response = await fetch('https://qrsimpleapiv2.azurewebsites.net/api/v1/main/getQRStatusAsync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ qrId: bnbQrId })
        });
        
        const data = await response.json();
        const status = document.getElementById('bnb-status');
        
        if (data.qrId === 2) {
            status.textContent = "¡PAGO CONFIRMADO!";
            status.className = "text-sm font-bold text-green-600";

            const student = await firebaseServices.students.getStudentByCI(ci);
            if (student) {
                const result = await firebaseServices.payments.addPayment(student.id, concept, {
                    date: new Date().toISOString().split('T')[0],
                    amount: amount,
                    method: 'bnb'
                });

                if (result.success) {
                    await displayParentReport(ci);
                }
            }

            clearInterval(bnbCheckInterval);
            setTimeout(closeBnbModal, 2000);
        } else if (data.qrId === 3) {
            status.textContent = "QR expirado";
            status.className = "text-sm font-bold text-red-600";
            clearInterval(bnbCheckInterval);
        } else {
            status.textContent = "Esperando pago...";
        }
    } catch (error) {
        console.error('Error verificando pago BNB:', error);
    }
}

function closeBnbModal() {
    document.getElementById('bnb-qr-modal').classList.add('hidden');
    if (bnbCheckInterval) clearInterval(bnbCheckInterval);
    bnbQrId = null;
}