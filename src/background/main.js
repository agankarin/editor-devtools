import { startsWith } from 'lodash';
import URL from 'url-parse';
import buildUrl from './urlBuilder';

const getActiveTab = () => {
  return new Promise(res => {
    chrome.tabs.query({ active: true, currentWindow: true }, t => res(t[0]));
  }).then(tab => {
    if (tab) {
      return tab;
    }
    return new Promise(res => {
      setTimeout(() => {
        getActiveTab().then(res);
      }, 100);
    });
  });
};

const executeScript = script => {
  return getActiveTab().then(({ id, url }) => {
    if (startsWith(url, 'chrome')) {
      return Promise.resolve();
    }

    return new Promise(res => {
      chrome.tabs.executeScript(id, {
        code: script,
      }, results => res(results && results[0]));
    });
  });
};

const isViewer = () => executeScript("!!Array.from(document.getElementsByTagName('meta')).find(e => e.httpEquiv === 'X-Wix-Renderer-Server')");

const isEditor = () => executeScript("!!Array.from(document.getElementsByTagName('meta')).find(e => e.httpEquiv === 'X-Wix-Editor-Server')");

const updateBrowserActionIcon = () => {
  Promise.all([isEditor(), isViewer()]).then(([editor, viewer]) => {
    const iconSufix = (editor || viewer) ? '' : '-disabled';
    chrome.browserAction.setIcon({
      path: {
        19: `assets/images/icon-19${iconSufix}.png`,
        38: `assets/images/icon-38${iconSufix}.png`,
      },
    });
  });
};

chrome.tabs.onActiveChanged.addListener(() => updateBrowserActionIcon());
chrome.tabs.onUpdated.addListener(() => updateBrowserActionIcon());

const applySettings = (option = 'All') => {
  getActiveTab().then(({ url, id }) => {
    buildUrl(url, option).then(newUrl => {
      chrome.tabs.update(id, { url: newUrl });
    });
  });
};

const logBackIn = () => {
  chrome.tabs.create({ url: 'https://users.wix.com/wix-users/login/form' });
};

const sendToContentPage = request => (
  getActiveTab().then(({ id }) => {
    return new Promise((res => {
      chrome.tabs.sendMessage(id, request, res);
    }));
  })
);

const getCurrentUsername = () => {
  return sendToContentPage({ type: 'getCurrentUsername' });
};

const addExperiment = experiment => {
  getActiveTab().then(({ url, id }) => {
    const parsedUrl = new URL(url, true);
    delete parsedUrl.search;
    parsedUrl.query.experiments = parsedUrl.query.experiments ? `${parsedUrl.query.experiments},${experiment}` : experiment;

    chrome.tabs.update(id, { url: parsedUrl.toString() });
  });
};

const openOptionsPage = () => {
  const url = chrome.extension.getURL('options.html');
  chrome.tabs.query({ url, currentWindow: true }, tabs => {
    if (!tabs || tabs.length === 0) {
      window.open(url);
    } else {
      chrome.tabs.update(tabs[0].id, { selected: true });
    }
  });
};

const debugPackage = (project, pkg) => {
  getActiveTab().then(({ id, url }) => {
    const parsedUrl = new URL(url, true);
    delete parsedUrl.search;
    if (!parsedUrl.query.debug) {
      parsedUrl.query.debug = pkg;
      chrome.tabs.update(id, { url: parsedUrl.toString() });
      return;
    }

    const packages = parsedUrl.query.debug.split(',');
    if (parsedUrl.query.debug === 'all' || packages.indexOf(pkg) !== -1) {
      return;
    }

    parsedUrl.query.debug = packages.concat(pkg).join(',');
    chrome.tabs.update(id, { url: parsedUrl.toString() });
  });
};

const debugAll = () => {
  getActiveTab().then(({ id, url }) => {
    const parsedUrl = new URL(url, true);
    delete parsedUrl.search;
    if (parsedUrl.query.debug === 'all') {
      return;
    }

    parsedUrl.query.debug = 'all';
    chrome.tabs.update(id, { url: parsedUrl.toString() });
  });
};

const isMobileView = () => (
  getActiveTab().then(({ url }) => {
    const parsedUrl = new URL(url, true);
    return parsedUrl.query.showMobileView === 'true';
  })
);

const setMobileView = isMobile => {
  getActiveTab().then(({ url, id }) => {
    const parsedUrl = new URL(url, true);
    delete parsedUrl.search;
    parsedUrl.query.showMobileView = isMobile;

    chrome.tabs.update(id, { url: parsedUrl.toString() });
  });
};

const openEditor = () => {
  const getMetaContent = meta => {
    const script = `(function() {
      const e = Array.from(document.getElementsByTagName('meta')).find(e => e.httpEquiv === '${meta}');
      return e && e.content;
    }());`;

    return executeScript(script);
  };

  Promise.all([
    getMetaContent('X-Wix-Meta-Site-Id'),
    getMetaContent('X-Wix-Application-Instance-Id'),
  ]).then(([metaSiteId, siteId]) => {
    chrome.tabs.getAllInWindow(tabs => {
      let baseUrl = `http://editor.wix.com/html/editor/web/renderer/edit/${siteId}`;
      const editorTab = tabs.find(tab => startsWith(tab.url, baseUrl));
      if (editorTab) {
        chrome.tabs.update(editorTab.id, { selected: true });
        return;
      }
      baseUrl += `?metaSiteId=${metaSiteId}`;
      buildUrl(baseUrl, 'All').then(url => {
        chrome.tabs.create({ url });
      });
    });
  });
};

/**
 * All the utils that will be available to the popup and options pages.
 */
window.Utils = {
  applySettings,
  logBackIn,
  getCurrentUsername,
  isViewer,
  isEditor,
  isMobileView,
  setMobileView,
  addExperiment,
  debugPackage,
  debugAll,
  openOptionsPage,
  openEditor,
};
