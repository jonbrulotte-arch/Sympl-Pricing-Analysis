import type { Permission } from "@/types";
import type { HelpArticle, HelpSection } from "./types";

/**
 * User documentation shown under Help & Docs. Articles and sections with `requires` only appear for users
 * who have at least one of those permissions, so each role sees help for what it can actually use.
 * Keep this in step with the app when features change.
 */
export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "getting-started",
    title: "Getting Started",
    summary: "What the platform does, signing in, finding your way around, and your profile.",
    icon: "Rocket",
    group: "Basics",
    sections: [
      {
        id: "overview",
        title: "What the platform does",
        blocks: [
          { p: "The platform works out how profitable each product is on each sales channel, after every fee, allocation, royalty and shipping cost, and recommends the list price that reaches your margin goal." },
          { p: "The main pieces fit together like this:" },
          {
            list: [
              "**Products** hold each SKU's cost, shipping costs and prices, imported from Salsify or spreadsheets.",
              "**Customers** own **sales channels**. Each channel carries its own fees and allocations (marketplace commission, coupons, returns, royalties and so on).",
              "An **analysis** runs a customer's products through a channel's fees to show net margin and a recommended price for every SKU.",
              "Prices you settle on are **committed**, then **published to Salsify**.",
            ],
          },
        ],
      },
      {
        id: "signing-in",
        title: "Signing in and passwords",
        blocks: [
          { p: "Sign in with your email address and password. If you've forgotten your password, choose **Forgot password?** on the sign-in page and enter your email. You'll get a link to set a new one; it works once and expires after 1 hour." },
          { p: "New users are invited by an administrator. The invitation email has a link to set your password, valid for 7 days." },
          { note: "Ask an administrator if your invitation or reset link has expired, or if you can't sign in." },
        ],
      },
      {
        id: "navigation",
        title: "Finding your way around",
        blocks: [
          { p: "The sidebar on the left lists the modules you can use. What you see depends on your role, so a colleague may see more or fewer items than you. Use the arrow at the bottom of the sidebar to collapse it." },
          { p: "Dates and times are shown in your own time zone." },
        ],
      },
      {
        id: "profile",
        title: "Your profile",
        blocks: [
          { p: "Open [My Profile](/profile) from your name at the bottom of the sidebar to update your name and password." },
          { h: "Salsify API key" },
          { p: "Syncing from and publishing to Salsify uses your own Salsify API key. Add it under **My Profile → Salsify API Key**. The key is stored encrypted and only its last four characters are ever shown again. Use **Replace Key** to change it." },
        ],
      },
      {
        id: "access",
        title: "Roles and access",
        blocks: [
          { p: "Your role decides which modules you see and what you can change: for example whether you can see unit cost, import data, edit royalties or publish to Salsify. You only see customers you've been added to (administrators see all of them)." },
          { p: "If you need access to something, ask an administrator to change your role or add you to a customer." },
        ],
      },
    ],
  },

  {
    slug: "dashboard",
    title: "Dashboard",
    summary: "Your starting page: product counts, your customers and quick actions.",
    icon: "LayoutDashboard",
    group: "Basics",
    sections: [
      {
        id: "dashboard",
        title: "What's on the dashboard",
        blocks: [
          {
            list: [
              "**Products in Database**: SKUs you have access to.",
              "**With Cost Data / Missing Cost Data**: how many of those have a unit cost. Click **Missing Cost Data** to see the list. Shown only if your role can see unit cost.",
              "**Your Customers**: the customers you belong to, with their channels and last import. Open one to work with it.",
              "**Quick Actions**: shortcuts to import products, create a customer or start a project, depending on your role.",
            ],
          },
        ],
      },
    ],
  },

  {
    slug: "products",
    title: "Products",
    summary: "The Product Database, a product's page, and its cost, shipping and price history.",
    icon: "Package",
    group: "Working with data",
    requires: ["module:products"],
    sections: [
      {
        id: "product-database",
        title: "The Product Database",
        blocks: [
          { p: "[Products](/products) lists every SKU you have access to, with its status, MCF freight and number of history records. Search by SKU, name or brand, and choose how many rows to show per page." },
          { p: "The cards at the top count your products. Click **Missing MCF Freight** (or **Missing Cost**, if your role can see cost) to filter the list to those products; click the filter chip to clear it." },
          { note: "If your role can't see unit cost, the Cost column, its date and the cost cards are hidden everywhere." },
        ],
      },
      {
        id: "assigning",
        title: "Assigning products to customers",
        requires: ["admin:settings"],
        blocks: [
          { p: "Products imported from Salsify belong to the catalog, not to any customer, until you assign them. Use the **Unassigned** filter to find them, tick the products, choose a customer and assign them. A customer's analysis only includes its assigned products." },
          { p: "You can also manage a customer's products from the customer's **Products** page." },
        ],
      },
      {
        id: "product-page",
        title: "A product's page",
        blocks: [
          { p: "Click a SKU anywhere in the platform to open its page. It shows the product's brand, inventory status, ASIN, FBA class and shipping weight, plus its history. Click the ASIN, here or under the SKU in an analysis table, to open the product's Amazon listing in a new tab." },
          { p: "Shipping weight comes from imports. When it's at or above the UPS weight break point, the card notes that the SKU's shipping cost uses the UPS rate." },
          { p: "If your role can update products, the **Cost & Shipping** card lets you enter a new unit cost or shipping cost. Each save adds a history record; nothing is overwritten." },
          { note: "A red banner marks discontinued SKUs, which are being sold through remaining stock and won't be reordered. Be careful raising prices on them.", tone: "warning" },
        ],
      },
      {
        id: "product-single-sku",
        title: "Opening a SKU in Single SKU Analysis",
        requires: ["module:singleSku"],
        blocks: [
          { p: "Click **Single SKU Analysis** at the top of a product's page, choose the customer and click **Next**. The SKU is already picked, customers that carry it are marked, and when only one does it's selected for you." },
        ],
      },
      {
        id: "product-projects",
        title: "Adding a SKU to a project",
        requires: ["module:projects"],
        blocks: [
          { steps: ["Click **Add to Project** at the top of a product's page.", "Choose one of your active projects. Projects that already have the SKU are marked and can't be picked again.", "Click **Add to Project**, then follow the link to open the project."] },
          { note: "If the project's customer doesn't carry the SKU yet, adding it to the project also adds it to that customer's products." },
        ],
      },
      {
        id: "history",
        title: "Cost, price and shipping history",
        blocks: [
          { p: "**Cost History**, **Price History** and **Shipping Cost History** chart every recorded value. Click any row to see the details of that change:" },
          {
            table: {
              head: ["Detail", "What it shows"],
              rows: [
                ["Previous / New", "The value before and after, and the change in $ and %"],
                ["Customer and Channel", "Where the change came from. Catalog-wide values show \"All customers\" / \"All channels\""],
                ["Changed By", "The person who made it, or who ran the import"],
                ["Source", "How it was recorded, e.g. Committed in analysis, Published to Salsify, Salsify sync, Spreadsheet import"],
              ],
            },
          },
          { p: "Price History can be filtered by channel. Records from before these details were tracked are filled in where possible, otherwise shown as Unknown." },
        ],
      },
    ],
  },

  {
    slug: "importing-data",
    title: "Importing Data",
    summary: "Salsify sync, spreadsheet imports, supplemental cost data and MCF freight.",
    icon: "Upload",
    group: "Working with data",
    requires: ["import:upload"],
    sections: [
      {
        id: "options",
        title: "Ways to bring data in",
        blocks: [
          { p: "Imports are started from the buttons at the top of [Products](/products), or from **Import Data** on a customer's page." },
          {
            table: {
              head: ["Import", "Use it for"],
              rows: [
                ["Salsify Sync", "Pulls the full catalog from your Salsify channel export: names, brands, item types, prices and shipping."],
                ["Import Spreadsheet", "Loads products from an .xlsx, .xls or .csv file, mapping its columns to fields."],
                ["Supplemental Data", "Updates unit cost and MCF freight for SKUs that already exist."],
                ["Import MCF Freight", "Pulls the latest average MCF freight per SKU from the freight report."],
              ],
            },
          },
        ],
      },
      {
        id: "salsify-sync",
        title: "Salsify Sync",
        blocks: [
          { steps: ["Make sure your Salsify API key is saved in **My Profile**.", "Open **Salsify Sync** and start the sync.", "Wait while the channel export runs; large catalogs can take several minutes.", "When it finishes, you can download a supplemental sheet listing SKUs that still need cost data."] },
          { note: "Salsify must be enabled by an administrator before anyone can sync." },
        ],
      },
      {
        id: "spreadsheet",
        title: "Spreadsheet imports",
        blocks: [
          { steps: ["Drag a file onto the page or choose **Browse Files**.", "On **Map Columns**, match each spreadsheet column to a field. Columns are matched automatically where the headings are recognized; fields marked Required must be mapped.", "Check the **Import Preview**, then import."] },
          { p: "Each import only adds history: a new cost, price or shipping record is written when the value changed. Use **Need a template?** on the spreadsheet import page for a file with the expected columns." },
        ],
      },
      {
        id: "shipping-weight",
        title: "Heavy SKUs and UPS shipping",
        blocks: [
          { p: "When a Salsify Sync or spreadsheet import includes **Shipping Weight** and **UPS Shipping Cost**, each SKU's per-unit shipping cost is picked by weight:" },
          {
            table: {
              head: ["Shipping Weight", "Shipping cost used"],
              rows: [
                ["At or above the UPS weight break point (14 lb unless an admin changed it)", "UPS Shipping Cost"],
                ["Below the break point, or no weight given", "Shipping Cost"],
              ],
            },
          },
          { note: "A heavy SKU with no UPS Shipping Cost keeps its Shipping Cost, and the import summary counts it so you can fill in the missing value." },
        ],
      },
      {
        id: "supplemental",
        title: "Supplemental data",
        blocks: [
          { p: "Use **Supplemental Data** to fill in unit cost and MCF freight for existing SKUs. The only required column is SKU; the optional columns are **SKU Cost** and **To MCF Freight Cost**. SKUs that aren't already in the database are skipped." },
        ],
      },
    ],
  },

  {
    slug: "customers-and-channels",
    title: "Customers & Channels",
    summary: "Setting up customers, their sales channels, fees, allocations and Salsify product lists.",
    icon: "Building2",
    group: "Working with data",
    requires: ["module:customers"],
    sections: [
      {
        id: "customers",
        title: "Customers",
        blocks: [
          { p: "[Customers](/customers) lists the customers you belong to. A customer's page shows its **Sales Channels**, active **Projects**, and **Needs Attention** items such as products missing cost data or committed changes waiting to publish." },
          { p: "From a customer you can open the full **Analysis**, open one channel's analysis with its **Analysis** button, manage the customer's **Products**, and import data." },
          { h: "Collaborators" },
          { p: "The customer's owner can add or remove collaborators: other users who can work with that customer." },
        ],
      },
      {
        id: "channels",
        title: "Adding a channel",
        blocks: [
          { p: "Add a channel from the customer's page and start from a template. Templates set which fee types apply and how shipping is calculated:" },
          {
            table: {
              head: ["Template", "Typical fees"],
              rows: [
                ["eBay-style", "Coupon, sales tax on fees, commission, top seller discount, promoted listings, fixed final value fee, PPC"],
                ["Amazon-style", "Coupon, referral fee (with a $0.30 per-unit minimum and per-SKU / item type overrides), advertising"],
                ["Marketplace (commission)", "Category commission, PPC"],
                ["DTC (card processing)", "Coupon, card processing %, per-order card fee, PPC"],
                ["Domestic Bulk Commercial/Retail (B2B), Domestic DropShip (DSV-D2C), Direct Import (FOB/FCA)", "Commercial channels: net terms and up to five additional allocations; freight excluded"],
                ["Custom", "Start from scratch and choose which fee types apply"],
              ],
            },
          },
          { p: "Shipping is calculated by the channel's mode: **Standard** uses the shipping cost per unit; **MCF** uses MCF shipping plus inbound freight; **FBA** uses the FBA fulfillment fee plus inbound freight. Commercial channels exclude freight." },
        ],
      },
      {
        id: "settings",
        title: "Channel settings",
        blocks: [
          { p: "Click a channel (or its gear icon) to edit its settings. Changes apply to every analysis of that channel once saved." },
          {
            table: {
              head: ["Section", "What it controls"],
              rows: [
                ["Goal", "The goal net margin %. SKUs below it get a recommended price that clears it."],
                ["Marketplace assumptions", "The channel's fee rates: coupon, sales tax, commission or referral fee, top seller discount, promoted listings, fixed fees, card processing, advertising and PPC."],
                ["Royalty", "The default royalty, whether it's a % of the sale or $ per unit, and whether the import's royalty column or the brand table wins."],
                ["Returns and warranty", "An allowance taken as a share of the sale."],
                ["Channel Assumptions & Allocations", "Commercial channels only: net terms and additional allocations."],
                ["Brand availability", "Untick brands the channel can't sell; they're left out of its analysis."],
                ["Inventory and lifecycle", "Hiding discontinued SKUs from the analysis, their sell-down goal, keeping discontinued or out-of-stock SKUs out of the change report, and the low-stock flag."],
                ["Repricing rules", "Price fallback, how recommended prices are rounded, and the target profit as a % of cost."],
              ],
            },
          },
          { h: "Price Recording" },
          { p: "**At Commit** records a price in price history as soon as it's committed in an analysis. **At Publish to Salsify** waits until it's published." },
          { h: "Default channel" },
          { p: "Default channels are marked with a badge on the customer's page and can't be deleted." },
        ],
      },
      {
        id: "salsify-list",
        title: "Salsify Product List",
        blocks: [
          { p: "A channel can be tied to a Salsify product list. Enter the **List ID or URL**, save, then **Sync now**. The channel's analysis then only includes the SKUs on that list, and their prices are taken from the list's price property." },
        ],
      },
      {
        id: "item-types",
        title: "Item type referral fees",
        blocks: [
          { p: "Amazon-style channels show **Item Type Referral Fee Overrides**. Set a referral fee % for an Amazon item type and every product of that type uses it instead of the channel's default. A per-SKU referral fee from an import still takes priority, and the per-unit minimum still applies." },
          { p: "Use **Export** for a spreadsheet of the customer's item types, fill in the fees, and **Import** it back. Leaving a fee blank removes that override." },
        ],
      },
    ],
  },

  {
    slug: "analysis",
    title: "Running an Analysis",
    summary: "Reading results, editing prices and shipping, committing, and exporting.",
    icon: "BarChart3",
    group: "Pricing",
    requires: ["module:customers"],
    sections: [
      {
        id: "opening",
        title: "Opening an analysis",
        blocks: [
          { p: "From a customer, choose **Analysis** for every channel (one tab each), or a channel's own **Analysis** button for just that channel. Projects have the same analysis for their products." },
          { p: "Each tab analyzes the customer's products on that channel, skipping blocked brands, discontinued SKUs if the channel hides them, and, for channels with a Salsify product list, SKUs not on the list." },
        ],
      },
      {
        id: "reading",
        title: "Reading the results",
        blocks: [
          { p: "The cards at the top summarize the tab: SKUs in scope, how many are at goal, below goal or losing money, the average net margin, total margin, how many need repricing and how many have no price." },
          {
            table: {
              head: ["Column", "Meaning"],
              rows: [
                ["Price", "The list price on this channel. Click it to try a different price."],
                ["Ship", "Shipping per order for this channel. Click it to try different shipping costs."],
                ["NM%", "Net margin: what's left after every fee, allocation, royalty, shipping and cost, as a % of revenue."],
                ["Net $", "Net margin in dollars per order."],
                ["Rec", "The recommended price: the lowest rounded price that reaches the goal."],
                ["+/-%", "How far the recommended price is from the current price."],
                ["Status", "At Goal, Below (profitable but under goal), Loss, or Unpriced."],
              ],
            },
          },
          { p: "Click **Detail** on a row for a breakdown of where the list price goes (cost, fees and allocations, shipping, net) and a fee ledger for one order." },
          { p: "Filter by status, search by SKU, name or brand, and narrow by brand. The count above the table reads like \"30 of 30 SKUs · 1 missing cost\"; SKUs without a cost can't be analyzed and are left out of the cards." },
          { note: "If your role can't see unit cost, cost is hidden and the analysis is calculated on the server. Margins and fees still show." },
        ],
      },
      {
        id: "editing",
        title: "Trying different prices and shipping",
        blocks: [
          { p: "Click a price, type a new one and press Enter. Edited prices turn blue and the row recalculates straight away. Shipping edits work the same way and apply to every channel tab, because shipping belongs to the product." },
          { p: "Edits are only on your screen until you commit them. Clear the field to go back to the stored price." },
        ],
      },
      {
        id: "committing",
        title: "Committing prices",
        blocks: [
          { p: "**Commit** on a row saves its edited price, or its recommended price if you haven't edited it, plus any shipping edits. Tick several rows and use **Commit Selected** to commit them together." },
          { p: "A commit:" },
          {
            list: [
              "records the price in price history (straight away, or when published, depending on the channel's Price Recording setting),",
              "stages the price for **Publish to Salsify**, with the old and new net margin,",
              "is logged in the Activity Log with your name.",
            ],
          },
        ],
      },
      {
        id: "calc-check",
        title: "Calculation Check",
        requires: ["data:viewCost"],
        blocks: [
          { p: "**Calculation Check** (or **Show the math for this SKU** in a row's detail) walks through every step of a SKU's calculation and checks that the figures add up. Use it when a number looks wrong." },
        ],
      },
      {
        id: "export",
        title: "Exporting",
        requires: ["analysis:export"],
        blocks: [
          { p: "**Export** downloads the current tab as a spreadsheet:" },
          { list: ["**Change Report**: only SKUs whose recommended price differs from the current price, with old and new margins.", "**Full Analysis**: every SKU with its full fee breakdown."] },
          { note: "If your role can't see unit cost, exports leave out cost and, in the Full Analysis, the fee breakdown columns." },
        ],
      },
    ],
  },

  {
    slug: "publishing-to-salsify",
    title: "Publishing to Salsify",
    summary: "Sending committed prices to Salsify, undoing them, and field mapping.",
    icon: "Send",
    group: "Pricing",
    requires: ["salsify:publish", "salsify:mapping"],
    sections: [
      {
        id: "publish",
        title: "Publishing committed prices",
        requires: ["salsify:publish"],
        blocks: [
          { p: "Committed prices wait on the **Publish to Salsify** tab of a customer's analysis. A customer's page shows how many are waiting under **Needs Attention**." },
          { steps: ["Open the **Publish to Salsify** tab. Filter by channel or brand if you need to.", "Tick the changes to send and choose **Publish Selected**, or publish a single SKU from its row.", "Check the preview, which shows each SKU's current value in Salsify next to the new one. Download the **Change Report** if you want a record.", "Choose **Confirm Publish**."] },
          { p: "Publishing needs your own Salsify API key (in **My Profile**) and Salsify enabled by an administrator. Shipping changes are never sent to Salsify; they're recorded in the platform when published." },
        ],
      },
      {
        id: "undo",
        title: "Undoing a staged change",
        requires: ["salsify:publish"],
        blocks: [
          { p: "Use **Undo — revert to previous price** to drop a staged change. On channels that record prices at commit, the previous price is recorded again so history stays accurate." },
        ],
      },
      {
        id: "mapping",
        title: "Salsify Field Mapping",
        requires: ["salsify:mapping"],
        blocks: [
          { p: "Each customer's **Salsify Mapping** page tells the platform which Salsify property holds the SKU and each price field. A channel can only publish once the SKU and that channel's price field are mapped." },
        ],
      },
    ],
  },

  {
    slug: "single-sku-analysis",
    title: "Single SKU Analysis",
    summary: "Price one SKU across a customer's channels, try what-ifs, export a report, and add new SKUs.",
    icon: "Calculator",
    group: "Pricing",
    requires: ["module:singleSku"],
    sections: [
      {
        id: "steps",
        title: "How it works",
        blocks: [
          { steps: ["**Customer**: choose a customer, then **Next**.", "**SKU**: search for an existing SKU, or choose **Create a new SKU**.", "**Calculator**: switch between the customer's sales channels with the tabs, adjust the inputs, and watch the results update."] },
          { p: "The calculator opens on the customer's default channel. Each channel tab shows its net margin once it's been calculated, so you can compare channels at a glance." },
        ],
      },
      {
        id: "calculator",
        title: "The calculator",
        blocks: [
          { p: "On the left are the inputs: the product's details, **Unit cost**, **List price**, **Units per order**, the channel's shipping costs, and every allocation that applies to the channel (goal, marketplace fees, royalty, returns, commercial allocations, rounding and target profit). They start at the channel's settings." },
          { p: "**Unit cost, units per order and shipping belong to the product**, so they carry across every channel tab. **The list price and allocations are per channel**, so changing them on one tab doesn't affect the others." },
          { p: "On the right are the results: net margin, net $ per order, the recommended price (choose **Use this price** to try it), the status, and the same price breakdown and fee ledger as the analysis." },
          { note: "Allocation changes are only for this calculation; the channel isn't changed. **Reset allocations to channel** puts them back." },
          { p: "If the SKU's brand is blocked on the channel, it isn't on the channel's Salsify product list, or it's discontinued and the channel hides discontinued SKUs, a warning explains that it won't appear in that channel's analysis." },
          { note: "If your role can't see unit cost, an existing SKU's cost shows as Hidden and its stored cost is used." },
        ],
      },
      {
        id: "saving",
        title: "Saving your work",
        blocks: [
          {
            table: {
              head: ["Button", "What it does"],
              rows: [
                ["Commit to Product Database", "New SKUs: adds the SKU to the database for this customer, with its cost, shipping, and the list price you entered on each channel. Needs the Products: Update permission."],
                ["Commit Price", "Existing SKUs: commits the list price and any shipping changes for this channel, exactly like a commit in the analysis. Cost isn't changed."],
                ["Publish to Salsify", "Existing SKUs: sends the list price to Salsify and records it."],
                ["Commit & Publish to Salsify", "New SKUs: adds the SKU to the database, then creates it in Salsify with its SKU and price."],
                ["Discard", "Throws the calculation away and returns to choosing a SKU."],
              ],
            },
          },
          { p: "Commit Price and the publish buttons act on the channel tab you're on. The publish buttons only appear when you can publish to Salsify, you have a Salsify API key, and the customer's field mapping covers the SKU and that channel's price. **Commit Price** only works for SKUs that belong to the selected customer." },
        ],
      },
      {
        id: "export",
        title: "Exporting a report",
        requires: ["analysis:export"],
        blocks: [
          { p: "**Export Report** opens a print-ready preview laid out like the analysis screen. Choose **This channel**, or **All channels** to start with a summary page comparing every channel's margin against its goal." },
          { p: "Each channel gets an overview page (KPI cards, where the list price goes, and the fee ledger) and a details page (list price vs. recommended price, the inputs, and every allocation, with values you edited shown in blue next to the channel's own setting)." },
          { steps: ["Click **Save as PDF / Print** in the preview.", "In the print dialog, choose **Save as PDF** as the destination (pages are landscape, letter size).", "Use **Download spreadsheet** instead if you want the raw numbers in Excel.", "Click **Close** or press Esc to return to the calculator."] },
          { note: "If your role can't see unit cost, the report leaves out cost and the fee breakdown." },
        ],
      },
    ],
  },

  {
    slug: "projects",
    title: "Projects",
    summary: "Analyzing a hand-picked group of products for a customer.",
    icon: "FolderKanban",
    group: "Pricing",
    requires: ["module:projects"],
    sections: [
      {
        id: "projects",
        title: "Using projects",
        blocks: [
          { p: "A project is a named group of a customer's products, useful for a line review, a promotion or a new range." },
          { steps: ["On [Projects](/projects) choose **New Project**, pick the customer, and name it.", "Open the project and use **Add Products** to choose SKUs (they must be imported first).", "The project shows the same analysis as the customer, limited to its products."] },
          { p: "Rename or delete a project from its page. Deleting a project doesn't delete any products or prices." },
        ],
      },
    ],
  },

  {
    slug: "royalty-rules",
    title: "Royalty Rules",
    summary: "Global, customer and channel royalty rules, and which one applies.",
    icon: "DollarSign",
    group: "Pricing",
    requires: ["module:royalties"],
    sections: [
      {
        id: "rules",
        title: "Royalty rules",
        blocks: [
          { p: "[Royalty Rules](/royalty-rules) set the royalty for a **brand** or for specific **SKUs**, either as a % of the sale (after coupons) or as $ per unit." },
          { list: ["**Global rules** apply to every customer.", "**Customer overrides** replace them for one customer, and can be limited to one sales channel."] },
          { note: "Adding or changing rules needs the Edit Royalties permission. Global rules also need an administrator." },
        ],
      },
      {
        id: "precedence",
        title: "Which royalty applies",
        blocks: [
          { p: "For each SKU on a channel, the most specific rule wins, in this order:" },
          { steps: ["A SKU rule for this channel", "A brand rule for this channel", "A SKU rule for this customer", "A brand rule for this customer", "A global SKU rule", "A global brand rule"] },
          { p: "If no rule matches, the channel's **Royalty** settings decide: the royalty from the import or the brand table (whichever the channel prefers), otherwise the channel's default royalty. The row's detail shows which source was used." },
        ],
      },
    ],
  },

  {
    slug: "activity-log",
    title: "Activity Log",
    summary: "Who changed what, and when.",
    icon: "ClipboardList",
    group: "Reference",
    requires: ["module:activityLog"],
    sections: [
      {
        id: "log",
        title: "Using the Activity Log",
        blocks: [
          { p: "The [Activity Log](/activity-log) records changes across the platform: price commits, imports, publishes, product edits, channel and customer changes, royalty changes and more." },
          { p: "Filter by category or customer, or search the summaries. Click an entry to expand it. Price commits, product edits, new SKUs and Single SKU publishes show the SKU, customer, channel, who made the change and how, with each value's previous and new figure." },
          { p: "You see entries for the customers you belong to, plus your own. Administrators see everything." },
        ],
      },
    ],
  },

  {
    slug: "how-pricing-works",
    title: "How Pricing Is Calculated",
    summary: "Net margin, every fee and allocation, statuses and the recommended price.",
    icon: "Sigma",
    group: "Reference",
    sections: [
      {
        id: "net-margin",
        title: "Net margin",
        blocks: [
          { p: "For each SKU on a channel, the platform starts from the list price and takes away everything the sale costs:" },
          { p: "**Net = revenue − fees and allocations − royalty − shipping − cost**, and **net margin (NM%) = net ÷ revenue**." },
          { p: "Everything is worked out per order, so a multi-pack (more than one unit per order) multiplies cost and per-unit fees by the units." },
        ],
      },
      {
        id: "fees",
        title: "Fees and allocations",
        blocks: [
          {
            table: {
              head: ["Item", "How it's charged"],
              rows: [
                ["Coupon", "A % off the list price."],
                ["Sales tax", "Collected on the post-coupon price and passed through, but marketplace fees are charged on the taxed amount."],
                ["Commission / referral fee", "A % of the sale. Amazon-style channels charge at least the per-unit minimum ($0.30 by default), and can use a per-SKU or item type rate."],
                ["Top seller discount", "A % credited back off the commission."],
                ["Promoted listing, advertising", "A % of the sale."],
                ["Fixed final value fee, PPC", "$ per unit or per order."],
                ["Card processing", "A % of the sale plus a fee per order."],
                ["Returns and warranty", "An allowance as a % of the sale."],
                ["Net terms, additional allocations", "Commercial channels: a % of the sale."],
                ["Royalty", "A % of the post-coupon sale, or $ per unit (see Royalty Rules)."],
                ["Shipping", "Per the channel's shipping mode; excluded on commercial channels."],
              ],
            },
          },
        ],
      },
      {
        id: "statuses",
        title: "Statuses",
        blocks: [
          {
            table: {
              head: ["Status", "Meaning"],
              rows: [
                ["At Goal", "Net margin is at or above the channel's goal."],
                ["Below", "Profitable, but under the goal."],
                ["Loss", "Net is negative: the sale loses money."],
                ["Unpriced", "There's no price on this channel yet."],
                ["Missing cost", "No unit cost, so the SKU can't be analyzed."],
              ],
            },
          },
          { p: "Discontinued SKUs are judged against the channel's **sell-down goal** instead of the normal goal." },
        ],
      },
      {
        id: "recommended",
        title: "The recommended price",
        blocks: [
          { p: "The recommended price is the lowest price that reaches the goal margin once every fee is taken out. It's rounded up using the channel's rounding rule (for example to a .99 ending), and nudged up a step if rounding leaves it just short of the goal." },
          { p: "**Target profit** is a second check: the net per unit compared with a % of the unit cost. The detail panel says whether it's met." },
          { p: "If a channel has no price and **price fallback** is on, the channel's fallback price field is used instead." },
        ],
      },
    ],
  },

  {
    slug: "administration",
    title: "Administration",
    summary: "Users, roles and permissions, and platform settings.",
    icon: "Shield",
    group: "Administration",
    requires: ["admin:users", "admin:roles", "admin:settings"],
    sections: [
      {
        id: "users",
        title: "Users",
        requires: ["admin:users"],
        blocks: [
          { p: "[Users](/admin/users) lists everyone with their role, customers, last login and created date. **Invite User** emails a link to set a password (valid 7 days); **Add User** creates an account with a password you choose. Edit a user to change their role or reset their password, or remove them." },
        ],
      },
      {
        id: "roles",
        title: "Roles and permissions",
        requires: ["admin:roles"],
        blocks: [
          { p: "[Roles](/admin/roles) bundle permissions. Create a role, tick what it can do, and assign it to users. Administrators (Manage Settings) always have the newer Salsify and Single SKU Analysis permissions." },
          {
            table: {
              head: ["Permission", "Allows"],
              rows: [
                ["Modules", "Seeing Products, Customers, Projects, Royalty Rules, Activity Log and Single SKU Analysis"],
                ["Customers / Channels: Create, Edit, Delete", "Managing customers and their channels"],
                ["Products: Update / Delete", "Editing cost and shipping, adding new SKUs from Single SKU Analysis, deleting products"],
                ["Analysis: Create / Export", "Analyses and the Export menu"],
                ["Import Products", "Every import (Salsify sync, spreadsheet, supplemental, MCF freight)"],
                ["Edit Royalties", "Changing royalty rules"],
                ["View Unit Cost", "Seeing cost anywhere. Without it, cost is hidden and kept off the user's screen"],
                ["View All Channel Price History", "Price history for channels the user doesn't belong to"],
                ["Salsify: Field Mapping / Publish", "Editing Salsify field mapping; publishing and undoing staged changes"],
                ["Manage Users / Settings / Roles", "Administration"],
              ],
            },
          },
        ],
      },
      {
        id: "settings",
        title: "Settings",
        requires: ["admin:settings"],
        blocks: [
          {
            list: [
              "**Platform Name & Logo**: replace the platform's name and logo everywhere. **Hide logo and name on the sign-in pages** removes every sign of the platform from the sign-in pages for anyone not signed in, including the browser tab title.",
              "**Salsify Integration**: enable syncing, and set the Organization ID and Channel Export ID. Each user adds their own API key in My Profile. The **UPS Weight Break Point** (14 lb by default) sets the weight at which imports use UPS Shipping Cost instead of Shipping Cost; leave it blank to turn that off.",
              "**Email Configuration**: the account used for invitations and password resets. Send a test email to check it.",
              "**Purge Products Database** (Danger Zone): permanently removes all products and their history.",
            ],
          },
        ],
      },
    ],
  },

  {
    slug: "faq",
    title: "FAQ & Troubleshooting",
    summary: "Answers to common questions.",
    icon: "HelpCircle",
    group: "Reference",
    sections: [
      {
        id: "missing-product",
        title: "Why isn't a product in my analysis?",
        blocks: [
          { list: ["It isn't assigned to the customer. Ask an administrator, or use the customer's Products page.", "Its brand is blocked on the channel (Brand availability).", "The channel uses a Salsify product list and the SKU isn't on it.", "It's discontinued and the channel hides discontinued SKUs (Inventory and lifecycle)."] },
        ],
      },
      {
        id: "missing-cost",
        title: "Why does a SKU say it's missing cost?",
        blocks: [{ p: "There's no unit cost on file. Add one with a Supplemental Data import or on the product's page, then reopen the analysis." }],
      },
      {
        id: "edits-gone",
        title: "My price edits disappeared",
        blocks: [{ p: "Edits in an analysis are only on your screen until you **Commit** them. Leaving or refreshing the page clears uncommitted edits." }],
      },
      {
        id: "no-publish",
        title: "Why can't I publish to Salsify?",
        blocks: [{ list: ["Your role needs the Salsify Publish permission.", "Add your Salsify API key in My Profile.", "An administrator must enable Salsify in Settings.", "The customer's Salsify Field Mapping must cover the SKU and the channel's price field."] }],
      },
      {
        id: "no-cost",
        title: "Why can't I see cost?",
        blocks: [{ p: "Your role doesn't include View Unit Cost. You still see margins, fees and recommended prices. Ask an administrator if you need cost." }],
      },
    ],
  },
];

const allowed = (perms: Set<Permission>, requires?: Permission[]) => !requires || requires.some((p) => perms.has(p));

/** The articles, and sections within them, that a user with these permissions can see. */
export function visibleArticles(perms: Set<Permission>): HelpArticle[] {
  return HELP_ARTICLES.filter((a) => allowed(perms, a.requires))
    .map((a) => ({ ...a, sections: a.sections.filter((s: HelpSection) => allowed(perms, s.requires)) }))
    .filter((a) => a.sections.length > 0);
}

export const HELP_GROUPS: HelpArticle["group"][] = ["Basics", "Working with data", "Pricing", "Reference", "Administration"];
