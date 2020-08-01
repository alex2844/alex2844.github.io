const
	fs = require('fs'),
	puppeteer = require('puppeteer'),
	{ createSitemap } = require('sitemap'),
	URL = (process.env.URL || 'https://alex2844.github.io/'),
	MAXDEPTH = parseInt(process.env.DEPTH) || 4,
	crawledPages = new Map();

function collectAllSameOriginAnchorsDeep(sameOrigin = true) {
	const allElements = [];
	const findAllElements = nodes => {
		for (let i = 0, el; el = nodes[i]; ++i) {
			allElements.push(el);
			if (el.shadowRoot)
				findAllElements(el.shadowRoot.querySelectorAll('*'));
		}
	};
	findAllElements(document.querySelectorAll('*'));
	const filtered = allElements
	.filter(el => (el.localName === 'a' && el.href))
	.filter(el => (el.href !== location.href))
	.filter(el => (sameOrigin ? new URL(location).origin === new URL(el.href).origin : true))
	.map(a => a.href);
	return Array.from(new Set(filtered));
}
async function crawl(browser, page, depth = 0) {
	page.url = page.url.replace(/(#(.*?)|\?t\d|\?categories&id=id)$/, '');
	if (depth > MAXDEPTH)
		return;
	if (crawledPages.has(page.url)) {
		console.log(`Reusing route: ${page.url}`);
		const item = crawledPages.get(page.url);
		page.title = item.title;
		page.img = item.img;
		page.children = item.children;
		page.children.forEach(c => {
			const item = crawledPages.get(c.url);
			c.title = item ? item.title : '';
			c.img = item ? item.img : null;
		});
		return;
	}else{
		console.log(`Loading: ${page.url}`);
		const newPage = await browser.newPage();
		newPage.on('dialog', async dialog => await dialog.dismiss());
		await newPage.goto(page.url, { waitUntil: 'networkidle2' });
		await newPage.waitFor(2500);
		let anchors = await newPage.evaluate(collectAllSameOriginAnchorsDeep);
		anchors = anchors.filter(a => a.split('#')[0] !== URL);
		page.title = await newPage.evaluate('document.title');
		page.children = anchors.map(url => ({ url }));
		crawledPages.set(page.url, page);
		await newPage.close();
	}
	for (const childPage of page.children) {
		await crawl(browser, childPage, depth + 1);
	}
}
function buildSitemap(rootURL = "") {
	if (!crawledPages)
		return;
	let siteMap = createSitemap({ hostname: rootURL });
	crawledPages.forEach(pg => {
		try {
			siteMap.add({ url: pg.url, title: pg.title });
		} catch (err) {}
	});
	try {
		fs.writeFile('./sitemap.xml', siteMap.toString(true), err => {
			if (err)
				throw err;
		});
	} catch (err) {
		throw err;
	}
}
(async () => {
	let browser;
	try {
		browser = await puppeteer.launch();
	} catch (e) {
		browser = await puppeteer.launch({ executablePath: 'chromium' });
	}
	let page = await browser.newPage(),
		root = { url: URL };
	await crawl(browser, root);
	buildSitemap(URL);
	await browser.close();
})();
