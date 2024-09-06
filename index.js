const express = require('express');
const puppeteer = require('puppeteer');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// Middleware para processar JSON no corpo da requisição
app.use(bodyParser.json());

// Rota para gerar o PIX
app.post('/gerar-pix', async (req, res) => {
  const { telefone, senha, valor } = req.body;

  if (!telefone || !senha || !valor) {
    return res.status(400).send({ error: 'Parâmetros faltando: telefone, senha e valor são obrigatórios.' });
  }

  try {
    // Inicializa o Puppeteer com configurações específicas para Heroku
    const browser = await puppeteer.launch({
      headless: true, // Executa em modo "headless" no Heroku
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();

    // Define um timeout maior para evitar erros de tempo de execução no Heroku
    page.setDefaultNavigationTimeout(60000); // 60 segundos

    // Navega até a página de login
    await page.goto('https://www.p9.com/login', { waitUntil: 'networkidle2' });
    console.log('Navegou até login');

    // Faz o login
    await page.type('[type="text"]', telefone);
    await page.type('[type="password"]', senha);
    await page.waitForSelector('[class="button active"]');
    await page.click('[class="button active"]');
    console.log('Tentativa de login enviada');

    // Aguarda a navegação pós-login
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    console.log('Login bem-sucedido, navegando para a página de depósito');

    // Navega até a página de depósito
    await page.goto('https://www.p9.com/deposit', { waitUntil: 'networkidle2' });
    console.log('Navegou até depósito');

    // Insere o valor e gera o PIX
    await page.type('[type="text"]', valor);
    await page.click('[class="button topUp active"]');

    // Espera o QR code ser gerado e carregado na página
    await page.waitForSelector('[class="qrImg"]', { timeout: 60000 });
    console.log('QR Code gerado!');

    // Captura a imagem do QR code em formato de URL de dados base64
    const qrCodeDataUrl = await page.evaluate(() => {
      const qrImgElement = document.querySelector('[class="qrImg"]');
      return qrImgElement.src; // Obtém a URL base64 da imagem
    });

    // Captura o valor do atributo data-clipboard-text que contém o código PIX
    const pixCode = await page.evaluate(() => {
      const buttonElement = document.querySelector('[data-clipboard-text]');
      return buttonElement.getAttribute('data-clipboard-text'); // Obtém o código PIX
    });

    // Remove o prefixo da URL de dados base64 e prepara para enviar como resposta
    const base64Data = qrCodeDataUrl.replace(/^data:image\/jpeg;base64,/, "");

    // Envia o QR Code em base64 e o código PIX como resposta
    res.status(200).send({ qrCodeBase64: base64Data, pixCode });

    await browser.close();
  } catch (error) {
    console.error('Erro ao gerar o QR Code do PIX:', error);

    // Envia o erro detalhado para facilitar o debug
    res.status(500).send({
      error: 'Erro ao gerar o QR Code do PIX',
      message: error.message,
      stack: error.stack
    });
  }
});

// Inicia o servidor
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
