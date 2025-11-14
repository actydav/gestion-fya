// ===== funciones del panel de padres o estudiantes =====

async function displayParentReport(ci) {
    const report = document.getElementById('parent-report');
    const student = await firebaseServices.students.getStudentByCI(ci);
    
    if (!student) {
        report.innerHTML = '<p class="text-gray-600">Estudiante no encontrado.</p>';
        return;
    }

    const allStudents = await firebaseServices.students.getStudents();
    const family = student.familyGroup ? 
        allStudents.filter(s => s.familyGroup === student.familyGroup) : [student];
    
    // CALCULAR ESTADO CORRECTAMENTE
    let isUpToDate = false;
    let totalMensualidadPagada = 0;
    
    if (student.familyGroup) {
        // Para familia: sumar todos los pagos de mensualidad del grupo
        family.forEach(member => {
            totalMensualidadPagada += member.payments?.['Mensualidad']?.total || 0;
        });
        isUpToDate = totalMensualidadPagada >= monthlyFee;
    } else {
        // Para estudiante individual
        totalMensualidadPagada = student.payments?.['Mensualidad']?.total || 0;
        isUpToDate = totalMensualidadPagada >= monthlyFee;
    }

    const paymentsMensualidad = family.map(s => ({ 
        name: s.name, 
        ci: s.ci, 
        paid: s.payments?.['Mensualidad']?.total || 0
    })).filter(p => p.paid > 0);

    report.innerHTML = `
        <div class="p-6 bg-white rounded-lg shadow-md">
            <h3 class="text-2xl font-bold fya-red-text mb-3">${student.lastNamePaternal} ${student.lastNameMaternal} ${student.firstName}</h3>
            <p><strong>CI:</strong> ${student.ci}</p>
            <p><strong>Grado:</strong> ${student.grade} ${student.parallel}</p>

            ${student.familyGroup ? family.filter(s => s.ci !== student.ci).map(sib => 
                `<p class="text-sm text-orange-700"><strong>Hermano:</strong> ${sib.name} (CI: ${sib.ci})</p>`
            ).join('') : ''}

            <div class="mt-5 p-4 bg-gray-50 rounded border">
                <h4 class="font-semibold fya-red-text mb-3">Ingresos</h4>
                <ul class="space-y-2">
                    ${concepts.map(c => {
                        if (c !== 'Mensualidad') {
                            return `<li class="flex justify-between"><span>${c}:</span> <span class="font-medium">${student.payments?.[c]?.total || 0} Bs</span></li>`;
                        }
                        return `
                            <li>
                                <div class="flex justify-between"><strong>${c}:</strong> <span>${student.payments?.[c]?.total || 0} Bs</span></div>
                                ${paymentsMensualidad.length > 0 ? `
                                    <div class="mt-1 text-sm"><strong>Pagado por:</strong>
                                        <ul class="pl-5 mt-1 space-y-1">
                                            ${paymentsMensualidad.map(p => `<li class="text-green-700">• ${p.name} ${p.ci === student.ci ? '(tú)' : '(hermano)'} - ${p.paid} Bs</li>`).join('')}
                                        </ul>
                                    </div>
                                ` : '<p class="text-sm text-gray-500 mt-1">Sin pagos</p>'}
                            </li>
                        `;
                    }).join('')}
                </ul>
            </div>

            <p class="mt-5 text-lg font-semibold">
                <strong>Estado:</strong> 
                <span class="${isUpToDate ? 'text-green-600' : 'text-red-600'}">${isUpToDate ? 'Al día' : 'Pendiente'}</span>
            </p>

            <div class="mt-6 flex gap-3">
                <button onclick="openQrPaymentModal('${student.ci}')" class="fya-red text-white px-5 py-2 rounded hover:bg-red-700">
                    Pagar con QR
                </button>
                <button onclick="showParentChart('${student.ci}')" class="bg-red-700 text-white px-5 py-2 rounded hover:bg-red-800">Ver Gráfico</button>
            </div>

            <div id="parent-chart-container" class="mt-6 hidden">
                <canvas id="parent-payment-chart"></canvas>
            </div>
        </div>
    `;
}

// Pago QR MEJORADO - Versión corregida
async function openQrPaymentModal(ci) {
    const modal = document.getElementById('qr-payment-modal');
    const canvas = document.getElementById('qr-canvas');
    const transactionIdSpan = document.getElementById('qr-transaction-id');
    const statusElement = document.getElementById('qr-status');
    
    const student = await firebaseServices.students.getStudentByCI(ci);
    if (!student) {
        alert('Estudiante no encontrado');
        return;
    }

    // Crear transacción única
    const transactionId = 'TXN_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // Obtener la URL base correctamente
    const baseUrl = window.location.origin + window.location.pathname;
    const basePath = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
    
    // Crear URL para la página de pago simulado
    const paymentUrl = `${basePath}pago-simulado.html?transaction=${transactionId}&ci=${ci}&amount=150&concept=Mensualidad&student=${encodeURIComponent(student.name)}`;
    
    console.log('Generando QR para URL:', paymentUrl);
    
    // Limpiar canvas antes de generar nuevo QR
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    // VERIFICAR SI QRCode ESTÁ CARGADO
    if (typeof QRCode === 'undefined') {
        alert('Error: La librería QRCode no está cargada. Recarga la página.');
        console.error('QRCode no está definido');
        return;
    }

    // Generar QR con la URL de pago
    try {
        QRCode.toCanvas(canvas, paymentUrl, function (error) {
            if (error) {
                console.error('Error generando QR:', error);
                alert('Error al generar el código QR. Recarga la página.');
                return;
            }
            
            console.log('QR generado exitosamente');
            
            // Guardar transacción en Firebase
            firebaseServices.transactions.createTransaction({
                transactionId: transactionId,
                studentCi: ci,
                studentName: student.name,
                amount: 150,
                concept: 'Mensualidad',
                status: 'pending',
                qrUrl: paymentUrl,
                createdAt: new Date().toISOString()
            }).then(transactionResult => {
                if (transactionResult.success) {
                    transactionIdSpan.textContent = transactionId;
                    statusElement.textContent = "QR listo - Escanea para pagar";
                    statusElement.className = "text-sm font-bold text-green-600";
                    modal.classList.remove('hidden');
                    
                    // Agregar enlace directo para testing
                    const qrContainer = document.getElementById('qr-container');
                    // Limpiar enlaces anteriores
                    const existingLink = qrContainer.querySelector('.test-link');
                    if (existingLink) {
                        existingLink.remove();
                    }
                    
                    const testLink = document.createElement('div');
                    testLink.className = "test-link mt-4 text-center";
                    testLink.innerHTML = `<a href="${paymentUrl}" target="_blank" class="text-blue-600 underline text-sm">Abrir página de pago directamente</a>`;
                    qrContainer.appendChild(testLink);
                    
                } else {
                    throw new Error('Error guardando transacción');
                }
            }).catch(error => {
                console.error('Error guardando transacción:', error);
                alert('Error al guardar la transacción: ' + error.message);
            });
        });
        
    } catch (error) {
        console.error('Error en generación de QR:', error);
        alert('Error inesperado: ' + error.message);
    }
}

function closeQrModal() {
    document.getElementById('qr-payment-modal').classList.add('hidden');
}

async function showParentChart(ci) {
    const container = document.getElementById('parent-chart-container');
    container.classList.remove('hidden');
    
    if (parentChart) {
        parentChart.destroy();
    }

    const student = await firebaseServices.students.getStudentByCI(ci);
    if (!student) return;

    const data = concepts.map(c => student.payments?.[c]?.total || 0);
    const ctx = document.getElementById('parent-payment-chart').getContext('2d');
    
    parentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: concepts,
            datasets: [{
                label: 'Ingresos del Estudiante',
                data: data,
                backgroundColor: '#C1272D',
                borderColor: '#A02020',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Ingresos del Estudiante'
                },
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return 'Bs ' + value;
                        }
                    }
                }
            }
        }
    });
}

// Función para verificar estado de pago
async function checkPaymentStatus(transactionId) {
    const transaction = await firebaseServices.transactions.getTransaction(transactionId);
    return transaction ? transaction.status : 'not_found';
}

// ===== ESCUCHAR ACTUALIZACIONES DE PAGO =====

// Escuchar mensajes de la ventana de pago
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'PAYMENT_COMPLETED') {
        console.log('Pago completado recibido:', event.data);
        
        // Cerrar el modal del QR si está abierto
        closeQrModal();
        
        // Mostrar mensaje de éxito
        alert('¡Pago procesado exitosamente! Los datos se han actualizado.');
        
        // Actualizar el reporte del estudiante automáticamente
        if (currentUser && currentUser.ci) {
            setTimeout(() => {
                displayParentReport(currentUser.ci);
            }, 1000);
        }
        
        // Si está en el panel de admin, actualizar también
        if (document.getElementById('admin-panel') && !document.getElementById('admin-panel').classList.contains('hidden')) {
            setTimeout(() => {
                filterStudentsByGradeAndParallel();
            }, 1000);
        }
    }
});

// Función para forzar actualización del reporte
async function refreshStudentReport() {
    if (currentUser && currentUser.ci) {
        await displayParentReport(currentUser.ci);
        alert('Datos actualizados');
    }
}

// Verificar pagos pendientes periódicamente
setInterval(async () => {
    if (currentUser && currentUser.ci) {
        await displayParentReport(currentUser.ci);
    }
}, 30000); // Actualizar cada 30 segundos