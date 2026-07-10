<#import "footer.ftl" as loginFooter>

<#macro username>
  <#assign label>
    <#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if>
  </#assign>
  <div class="form-item">
    <label class="form-label">${label}</label>
    <div class="input-wrapper input-wrapper--readonly">
      <span class="input-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      </span>
      <input id="kc-attempted-username" value="${auth.attemptedUsername}" readonly />
    </div>
    <button id="reset-login" type="button" class="reset-login-btn"
            aria-label="${msg('restartLoginTooltip')}" onclick="location.href='${url.loginRestartFlowUrl}'">
      ${msg('restartLoginTooltip')}
    </button>
  </div>
</#macro>

<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false>
<!DOCTYPE html>
<html lang="${lang}"<#if realm.internationalizationEnabled> dir="${(locale.rtl)?then('rtl','ltr')}"</#if>>
<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <title>${msg("identityPlatformName")}</title>
    <link rel="icon" href="${url.resourcesPath}/img/favicon.ico" />

    <#if properties.stylesCommon?has_content>
        <#list properties.stylesCommon?split(' ') as style>
            <link href="${url.resourcesCommonPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>
    <#if properties.styles?has_content>
        <#list properties.styles?split(' ') as style>
            <link href="${url.resourcesPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>

    <#if properties.scripts?has_content>
        <#list properties.scripts?split(' ') as script>
            <script src="${url.resourcesPath}/${script}" type="text/javascript"></script>
        </#list>
    </#if>

    <script type="module" src="${url.resourcesPath}/js/passwordVisibility.js"></script>
    <script type="module">
        <#outputformat "JavaScript">
        import { startSessionPolling } from "${url.resourcesPath}/js/authChecker.js";
        startSessionPolling(${url.ssoLoginInOtherTabsUrl?c});
        </#outputformat>
    </script>
    <#if authenticationSession??>
        <script type="module">
            <#outputformat "JavaScript">
            import { checkAuthSession } from "${url.resourcesPath}/js/authChecker.js";
            checkAuthSession(${authenticationSession.authSessionIdHash?c});
            </#outputformat>
        </script>
    </#if>
    <#if realm.internationalizationEnabled>
        <script>document.cookie="KEYCLOAK_LOCALE=${locale.currentLanguageTag};path=/realms/${realm.name};max-age=31536000;SameSite=Lax";</script>
    </#if>
</head>

<body class="custom-body">
<div class="login-wrapper">
    <#-- ============ LEFT BRANDING PANEL ============ -->
    <div class="login-left">
        <div class="login-left-bg"></div>
        <div class="bg-decor bg-decor-1"></div>
        <div class="bg-decor bg-decor-2"></div>
        <div class="bg-grid"></div>

        <div class="brand-header-top">
            <div class="brand-logo-icon">
                <img src="${url.resourcesPath}/img/logo.png" alt="Logo" class="logo-img" />
            </div>
        </div>

        <div class="login-left-content">
            <h1 class="brand-title">${msg("identityPlatformName")}</h1>
            <div class="brand-divider">
                <span class="divider-line"></span>
                <span class="divider-diamond"></span>
                <span class="divider-line"></span>
            </div>
            <p class="brand-subtitle">${msg("identityPlatformSubtitle")}</p>
            <div class="brand-desc">
                <p class="brand-desc-small">${msg("identityPlatformDesc")}</p>
            </div>
            <div class="brand-features">
                <div class="feature-item">
                    <div class="feature-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                            <path d="M9 12l2 2 4-4"/>
                        </svg>
                    </div>
                    <span>${msg("featureSecurity")}</span>
                </div>
                <div class="feature-item">
                    <div class="feature-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                            <circle cx="9" cy="7" r="4"/>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                    </div>
                    <span>${msg("featureUnified")}</span>
                </div>
            </div>
        </div>

        <div class="login-left-footer">
            <p>${msg("identityCopyright")}</p>
        </div>
    </div>

    <#-- ============ RIGHT FORM PANEL ============ -->
    <div class="login-right">
        <div class="login-form-wrapper">
            <#-- Language selector -->
            <#if realm.internationalizationEnabled && locale.supported?size gt 1>
            <div class="locale-switcher">
                <#list locale.supported?sort_by("label") as l>
                    <a href="${l.url}" class="locale-link ${(l.languageTag == locale.currentLanguageTag)?then('active','')}">
                        <#if l.languageTag?starts_with("zh")>中文<#elseif l.languageTag?starts_with("en")>English<#else>${l.label}</#if>
                    </a>
                </#list>
            </div>
            </#if>

            <div class="login-form-header">
                <h2 id="kc-page-title">
                    <#nested "header">
                </h2>
                <p>${msg("welcomeBackSubtitle")}</p>
            </div>

            <#-- Username display for multi-step flows -->
            <#if auth?has_content && auth.showUsername() && !auth.showResetCredentials()>
                <div class="show-username-area">
                    <#nested "show-username">
                    <@username />
                </div>
            </#if>

            <#-- Error / info messages -->
            <#if displayMessage && message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
                <div class="alert alert-${message.type}">
                    <span class="alert-icon">
                        <#if message.type = 'success'>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        <#elseif message.type = 'error'>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                        <#elseif message.type = 'warning'>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        <#else>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                        </#if>
                    </span>
                    <span class="alert-text">${message.summary}</span>
                </div>
            </#if>

            <#-- Form body (nested from login.ftl etc.) -->
            <#nested "form">

            <#-- Try another way -->
            <#if auth?has_content && auth.showTryAnotherWayLink()>
                <form id="kc-select-try-another-way-form" action="${url.loginAction}" method="post">
                    <input type="hidden" name="tryAnotherWay" value="on"/>
                    <a id="try-another-way" href="javascript:document.forms['kc-select-try-another-way-form'].requestSubmit()"
                       class="try-another-way-link">
                        ${msg("doTryAnotherWay")}
                    </a>
                </form>
            </#if>

            <#-- Social providers -->
            <#nested "socialProviders">

            <#-- Info section (registration link etc.) -->
            <#if displayInfo>
                <div class="login-info-section">
                    <#nested "info">
                </div>
            </#if>
        </div>
    </div>
</div>
</body>
</html>
</#macro>
