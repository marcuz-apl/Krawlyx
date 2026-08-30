# MyKrawl app



- I want to build a simple web app named "MyKrawl" to scrap any website.
- The web app shall be built with Python or Java, Please advise the best language for this purpose.
- The web crawl framework can be: `Firecrawl`, `Crawl4AI`, `Scrapy`, while the user shall be able to select the engine in the settings.
- Database wise: a simple file based SQLite3 file shall be enough to handle the case. If not, please advise.
- The app shall have sleek frontend UI, where the user/job runner can
  - select the crawl engine which have been pooled by admin user
  - type in the web address(es) for crawl jobs
  - batch run the series of crawl jobs

- The app shall have an Admin Panel as backend, where the admin user can 
   - select the crawling engine, 
   - schedule the web crawling, 
   - determine whether the crawled data shall be saved to local database or external shared folder, in the format of csv/Excel,
   - split the csv/excel when reaching a specific size, say 40 MB, if selecting save to csv/Excel files,



Feel free to be smart to advise the frontend and backend design, correcting me if you have better ideas and advice.



Please prepare the PRD.md and related AGENTS.md.