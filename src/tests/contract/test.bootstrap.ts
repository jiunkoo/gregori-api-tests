import { installAxiosCookieAuthAutoWrap } from "../../utils/axios-cookie-auth";
import { installLoggerAutoWrap } from "../../utils/logger";

installAxiosCookieAuthAutoWrap();
installLoggerAutoWrap();
